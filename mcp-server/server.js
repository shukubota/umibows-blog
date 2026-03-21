import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { readFile, writeFile, readdir } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);
const PROJECT_ROOT = "/Users/shukubota/projects/umibows-blog";

function createServer() {
  const server = new McpServer({ name: "blog-tools", version: "1.0.0" });

  server.tool(
    "read_file",
    "プロジェクト内のファイルを読む",
    { file_path: z.string().describe("PROJECT_ROOT からの相対パス") },
    async ({ file_path }) => {
      const abs = path.resolve(PROJECT_ROOT, file_path);
      if (!abs.startsWith(PROJECT_ROOT)) {
        return { content: [{ type: "text", text: "Error: プロジェクト外のパスは読めません" }] };
      }
      const content = await readFile(abs, "utf-8");
      return { content: [{ type: "text", text: content }] };
    }
  );

  server.tool(
    "write_file",
    "プロジェクト内のファイルを書き込む",
    {
      file_path: z.string().describe("PROJECT_ROOT からの相対パス"),
      content: z.string().describe("書き込む内容"),
    },
    async ({ file_path, content }) => {
      const abs = path.resolve(PROJECT_ROOT, file_path);
      if (!abs.startsWith(PROJECT_ROOT)) {
        return { content: [{ type: "text", text: "Error: プロジェクト外のパスには書けません" }] };
      }
      await writeFile(abs, content, "utf-8");
      return { content: [{ type: "text", text: `書き込み完了: ${file_path}` }] };
    }
  );

  server.tool(
    "list_files",
    "ディレクトリ内のファイル一覧を返す",
    { dir_path: z.string().describe("PROJECT_ROOT からの相対パス。省略時はルート").optional() },
    async ({ dir_path }) => {
      const abs = path.resolve(PROJECT_ROOT, dir_path ?? ".");
      if (!abs.startsWith(PROJECT_ROOT)) {
        return { content: [{ type: "text", text: "Error: プロジェクト外のパスは参照できません" }] };
      }
      const entries = await readdir(abs, { withFileTypes: true });
      const list = entries
        .map((e) => `${e.isDirectory() ? "[dir] " : "      "}${e.name}`)
        .join("\n");
      return { content: [{ type: "text", text: list }] };
    }
  );

  server.tool("git_status", "プロジェクトの git status を返す", {}, async () => {
    const { stdout } = await execAsync("git status", { cwd: PROJECT_ROOT });
    return { content: [{ type: "text", text: stdout }] };
  });

  server.tool(
    "git_log",
    "最近のコミット履歴を返す",
    { count: z.number().int().min(1).max(50).default(10).describe("取得件数") },
    async ({ count }) => {
      const { stdout } = await execAsync(`git log --oneline -${count}`, { cwd: PROJECT_ROOT });
      return { content: [{ type: "text", text: stdout }] };
    }
  );

  server.tool("git_diff", "ステージされていない変更の diff を返す", {}, async () => {
    const { stdout } = await execAsync("git diff", { cwd: PROJECT_ROOT });
    return { content: [{ type: "text", text: stdout || "(変更なし)" }] };
  });

  return server;
}

const app = express();
app.use(express.json());

const transports = new Map();

// POST: クライアントからのメッセージ受信
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  console.log(`[MCP] POST method=${req.body?.method} session=${sessionId ?? "new"}`);

  if (!sessionId) {
    // 新規セッション
    const id = randomUUID();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => id });
    const server = createServer();
    await server.connect(transport);
    transports.set(id, transport);
    transport.onclose = () => transports.delete(id);
    await transport.handleRequest(req, res, req.body);
  } else if (transports.has(sessionId)) {
    await transports.get(sessionId).handleRequest(req, res, req.body);
  } else {
    res.status(404).json({ error: "Session not found" });
  }
});

// GET: SSE ストリーム（サーバーからのプッシュ用）
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  console.log(`[MCP] GET session=${sessionId}`);
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).send("Invalid session");
    return;
  }
  await transports.get(sessionId).handleRequest(req, res);
});

// DELETE: セッション終了
app.delete("/mcp", (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  if (sessionId) transports.delete(sessionId);
  res.status(200).send("OK");
});

app.listen(8000, "0.0.0.0", () => {
  console.log("MCP server listening on :8000");
});
