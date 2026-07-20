/**
 * mahjong-nanikiru : 何切る MCP サーバー（Vercel / remote MCP 版）
 *
 * Claude cowork などの remote connector から Streamable HTTP で接続するエンドポイント。
 * mcp-handler(Vercel 公式アダプタ) で McpServer を Next.js の route handler に載せている。
 *
 * エンドポイント: https://<host>/api/mcp/mahjong-nanikiru/mcp
 * 認証: 環境変数 MAHJONG_MCP_TOKEN を設定すると ?key=<token> もしくは
 *       Authorization: Bearer <token> が必須になる（未設定なら素通し=ローカル用）。
 *
 * シャンテン/受け入れ計算は mcp-servers/mahjong-nanikiru/nanikiru-core.ts と共有（単一ソース）。
 * SSE は使わないので Redis 不要（disableSse: true）。
 */
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { createMcpHandler } from "mcp-handler";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  analyzeHand,
  TILES_DESCRIPTION,
  TOOL_DESCRIPTION,
  TOOL_NAME,
  TOOL_TITLE,
} from "@/mcp-servers/mahjong-nanikiru/nanikiru-core";

export const runtime = "nodejs";
export const maxDuration = 60;

const RESOURCE_URI = "ui://mahjong-nanikiru/hand.html";

// dist/hand.html は gitignore + Vercel では vite ビルドが走らないため、
// このディレクトリに追跡コピーを置き、outputFileTracingIncludes で関数バンドルへ含める。
const HTML_PATH = path.join(process.cwd(), "app/api/mcp/mahjong-nanikiru/hand.html");

let htmlCache: string | null = null;
async function readHandHtml(): Promise<string> {
  if (htmlCache == null) htmlCache = await fs.readFile(HTML_PATH, "utf-8");
  return htmlCache;
}

const handler = createMcpHandler(
  (server) => {
    registerAppTool(
      server,
      TOOL_NAME,
      {
        title: TOOL_TITLE,
        description: TOOL_DESCRIPTION,
        inputSchema: {
          tiles: z.array(z.string()).describe(TILES_DESCRIPTION),
        },
        _meta: { ui: { resourceUri: RESOURCE_URI } },
      },
      async ({ tiles }) => {
        const { structuredContent, text, isError } = analyzeHand(tiles);
        return {
          content: [{ type: "text" as const, text }],
          structuredContent,
          ...(isError ? { isError: true } : {}),
        };
      }
    );

    registerAppResource(
      server,
      RESOURCE_URI,
      RESOURCE_URI,
      { mimeType: RESOURCE_MIME_TYPE },
      async () => {
        const html = await readHandHtml();
        return { contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html }] };
      }
    );
  },
  { serverInfo: { name: "mahjong-nanikiru", version: "0.4.0" } },
  {
    basePath: "/api/mcp/mahjong-nanikiru",
    maxDuration: 60,
    disableSse: true,
    verboseLogs: false,
  }
);

// --- 共有トークン認証 ---
// cowork の remote connector は URL しか渡せないので ?key= を主に使う想定。
// ヘッダを送れるクライアント向けに Authorization: Bearer も許容する。
function authorized(req: Request): boolean {
  const token = process.env.MAHJONG_MCP_TOKEN;
  if (!token) return true; // 未設定時は素通し（ローカル開発）
  const provided =
    new URL(req.url).searchParams.get("key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;
  return provided === token;
}

async function guarded(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return handler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
