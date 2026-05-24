import path from "node:path";
import { promises as fs } from "node:fs";
import Database from "better-sqlite3";
import config from "@/agent.config";
import { logger } from "./logger";
import { complete } from "@/lib/llm/claude";
import type { Message, SessionState, Usage } from "./types";

let _db: Database.Database | null = null;
let _diskAvailable: boolean | null = null;

// In-memory fallback for serverless / read-only filesystems (e.g. Vercel /var/task).
const memSessions = new Map<string, SessionState>();
const memSummaries = new Map<string, MemoryHit[]>();

function sqlitePath(): string {
  // Vercel mounts the deploy bundle read-only at /var/task; only /tmp is writable.
  // We still prefer in-memory unless an explicit path is configured because /tmp is
  // ephemeral and per-instance.
  if (process.env.VERCEL) return "/tmp/agent.db";
  return config.memory.sqlitePath;
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
}

async function getDb(): Promise<Database.Database | null> {
  if (_db) return _db;
  if (_diskAvailable === false) return null;
  try {
    const target = sqlitePath();
    await ensureDir(target);
    const db = new Database(target);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        state_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS summaries (
        session_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        summary TEXT NOT NULL,
        up_to_turn INTEGER NOT NULL,
        PRIMARY KEY (session_id, up_to_turn)
      );
    `);
    _db = db;
    _diskAvailable = true;
    return db;
  } catch (e) {
    _diskAvailable = false;
    logger.warn(
      { err: e instanceof Error ? e.message : String(e) },
      "memory.disk_unavailable_fallback_to_inmemory"
    );
    return null;
  }
}

export interface MemoryHit {
  sessionId: string;
  summary: string;
  upToTurn: number;
  createdAt: number;
}

export const memory = {
  async load(sessionId: string): Promise<SessionState | null> {
    const db = await getDb();
    if (!db) return memSessions.get(sessionId) ?? null;
    const row = db.prepare("SELECT state_json FROM sessions WHERE id = ?").get(sessionId) as
      | { state_json: string }
      | undefined;
    if (!row) return null;
    return JSON.parse(row.state_json) as SessionState;
  },

  async save(state: SessionState): Promise<void> {
    const db = await getDb();
    if (!db) {
      memSessions.set(state.sessionId, JSON.parse(JSON.stringify(state)) as SessionState);
      return;
    }
    const now = Date.now();
    db.prepare(
      `INSERT INTO sessions (id, started_at, updated_at, state_json)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, state_json = excluded.state_json`
    ).run(state.sessionId, state.startedAt, now, JSON.stringify(state));
  },

  async recall(sessionId: string, k = 5): Promise<MemoryHit[]> {
    const db = await getDb();
    if (!db) {
      const arr = memSummaries.get(sessionId) ?? [];
      return arr.slice(0, k);
    }
    const rows = db
      .prepare(
        "SELECT session_id, summary, up_to_turn, created_at FROM summaries WHERE session_id = ? ORDER BY created_at DESC, up_to_turn DESC LIMIT ?"
      )
      .all(sessionId, k) as Array<{
      session_id: string;
      summary: string;
      up_to_turn: number;
      created_at: number;
    }>;
    return rows.map((r) => ({
      sessionId: r.session_id,
      summary: r.summary,
      upToTurn: r.up_to_turn,
      createdAt: r.created_at,
    }));
  },

  async appendSummary(sessionId: string, summary: string, upToTurn: number): Promise<void> {
    const db = await getDb();
    if (!db) {
      const arr = memSummaries.get(sessionId) ?? [];
      arr.unshift({ sessionId, summary, upToTurn, createdAt: Date.now() });
      memSummaries.set(sessionId, arr.slice(0, 20));
      return;
    }
    db.prepare(
      "INSERT OR REPLACE INTO summaries (session_id, created_at, summary, up_to_turn) VALUES (?, ?, ?, ?)"
    ).run(sessionId, Date.now(), summary, upToTurn);
  },

  /** Compress older turns if total used tokens exceeds threshold. Returns updated messages. */
  async summarizeIfNeeded(state: SessionState): Promise<SessionState> {
    const total = state.tokensUsed.input_tokens + state.tokensUsed.output_tokens;
    if (total < config.memory.summarizeAfterTokens) return state;
    if (state.messages.length < 6) return state;

    const keepTail = 4;
    const head = state.messages.slice(0, state.messages.length - keepTail);
    const tail = state.messages.slice(-keepTail);
    if (head.length === 0) return state;

    try {
      const headText = head
        .map((m) => {
          const t = m.content.map((b) => (b.type === "text" ? b.text : `[${b.type}]`)).join(" ");
          return `${m.role}: ${t}`;
        })
        .join("\n");
      const res = await complete({
        system:
          "Summarize the following conversation in 5 bullet points or fewer. Preserve key facts, decisions, and tool outcomes.",
        messages: [{ role: "user", content: [{ type: "text", text: headText }] }],
        maxTokens: 512,
      });
      const summary = res.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      await memory.appendSummary(state.sessionId, summary, head.length);
      const newMessages: Message[] = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `[Earlier conversation summary]\n${summary}`,
            },
          ],
        },
        ...tail,
      ];
      logger.info({ sessionId: state.sessionId, droppedTurns: head.length }, "memory.summarized");
      return { ...state, messages: newMessages };
    } catch (e) {
      logger.warn({ err: String(e) }, "memory.summarize_failed");
      return state;
    }
  },

  newSession(): SessionState {
    return {
      sessionId: `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      messages: [],
      tokensUsed: { input_tokens: 0, output_tokens: 0 } as Usage,
      turnCount: 0,
      startedAt: Date.now(),
      metadata: {},
    };
  },
};
