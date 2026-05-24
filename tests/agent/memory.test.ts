import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";

const tmp = path.join(os.tmpdir(), `agent-memory-test-${process.pid}`);

beforeAll(async () => {
  await fs.mkdir(tmp, { recursive: true });
});
afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("memory (SQLite)", () => {
  it("creates session, saves and reloads state", async () => {
    const cfg = (await import("@/agent.config")).default;
    cfg.memory.sqlitePath = path.join(tmp, "agent.db");
    const { memory } = await import("@/lib/agent/memory");
    const state = memory.newSession();
    state.messages.push({ role: "user", content: [{ type: "text", text: "hi" }] });
    state.tokensUsed.input_tokens = 10;
    state.tokensUsed.output_tokens = 5;
    await memory.save(state);

    const loaded = await memory.load(state.sessionId);
    expect(loaded?.tokensUsed.input_tokens).toBe(10);
    expect(loaded?.messages[0].content[0]).toEqual({ type: "text", text: "hi" });
  });

  it("appendSummary and recall", async () => {
    const cfg = (await import("@/agent.config")).default;
    cfg.memory.sqlitePath = path.join(tmp, "agent.db");
    const { memory } = await import("@/lib/agent/memory");
    const sid = `sess-x-${Date.now()}`;
    await memory.appendSummary(sid, "first summary", 5);
    await memory.appendSummary(sid, "second summary", 10);
    const hits = await memory.recall(sid, 5);
    expect(hits.length).toBe(2);
    expect(hits[0].upToTurn).toBe(10);
  });
});
