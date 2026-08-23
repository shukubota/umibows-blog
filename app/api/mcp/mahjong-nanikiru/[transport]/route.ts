/**
 * mahjong-nanikiru : 何切る MCP サーバー（Vercel / remote MCP 版）
 *
 * Claude cowork などの remote connector から Streamable HTTP で接続するエンドポイント。
 * mcp-handler(Vercel 公式アダプタ) で McpServer を Next.js の route handler に載せている。
 *
 * エンドポイント: https://<host>/api/mcp/mahjong-nanikiru/mcp
 *
 * 認証: Google OpenID Connect (OAuth 2.1) による Bearer トークン検証。
 *   - MCP サーバーは Resource Server のみ実装（AS は accounts.google.com）
 *   - RFC 9728 Protected Resource Metadata: /.well-known/oauth-protected-resource/...
 *   - トークン検証: oauth2.googleapis.com/tokeninfo（結果は TTL キャッシュ）
 *   - 許可判定: aud ∈ GOOGLE_OAUTH_CLIENT_IDS かつ email ∈ MCP_ALLOWED_EMAILS
 *
 * 移行期間: MAHJONG_MCP_TOKEN が設定されている間は ?key= / Bearer <shared-token> も許容。
 *   全クライアント移行後に同変数と対応コードを削除する（docs/mahjong-nanikiru/remote-mcp-google-oauth.md §10）。
 *
 * シャンテン/受け入れ計算は mcp-servers/mahjong-nanikiru/nanikiru-core.ts と共有（単一ソース）。
 * SSE は使わないので Redis 不要（disableSse: true）。
 */
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
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
import { getCachedToken, setCachedToken } from "@/lib/mcp/google-token-cache";

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

// ─── 認証設定 ────────────────────────────────────────────────────────────────

/**
 * withMcpAuth に渡す resourceUrl はオリジンとして使われる。
 * 実際の metadata URL: `${RESOURCE_ORIGIN}${RESOURCE_METADATA_PATH}`
 *   = https://www.umibows.com/.well-known/oauth-protected-resource/api/mcp/mahjong-nanikiru/mcp
 *
 * ローカル開発: .env.local に MCP_RESOURCE_ORIGIN=http://localhost:3000 を設定することで
 * mcp-remote がローカルサーバーを resource として認識できるようになる。
 */
const RESOURCE_ORIGIN = process.env.MCP_RESOURCE_ORIGIN ?? "https://www.umibows.com";
const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/api/mcp/mahjong-nanikiru/mcp";

/** カンマ区切りで Desktop 用・cowork 用の両 client_id を列挙する */
const ALLOWED_CLIENT_IDS = (process.env.GOOGLE_OAUTH_CLIENT_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED_EMAILS = (process.env.MCP_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ─── トークン検証 ─────────────────────────────────────────────────────────────

/**
 * Google tokeninfo を使ってアクセストークンを検証する。
 *
 * 移行期間: MAHJONG_MCP_TOKEN が設定されている場合は
 *   ?key= クエリパラメータもしくは shared-token による Bearer も許容する。
 *   全クライアントの Google OAuth 移行後に以下の「移行パス」ブロックごと削除する。
 */
async function verifyToken(req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  // ── 移行パス: 共有トークン (?key= or Bearer) ──────────────────────────────
  const sharedToken = process.env.MAHJONG_MCP_TOKEN;
  if (sharedToken) {
    const keyParam = new URL(req.url).searchParams.get("key");
    const provided = keyParam ?? bearerToken;
    if (provided === sharedToken) {
      return {
        token: provided,
        clientId: "shared-token",
        scopes: [],
      };
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Google OAuth 未設定（ローカル開発）は素通し
  if (ALLOWED_CLIENT_IDS.length === 0 || ALLOWED_EMAILS.length === 0) return undefined;
  if (!bearerToken) return undefined;

  // キャッシュヒット
  const cached = getCachedToken(bearerToken);
  if (cached) return cached;

  // tokeninfo でトークンを introspect
  // ⚠ Google のアクセストークンは opaque 文字列なので JWKS ローカル検証は不可。
  //   tokeninfo の aud = このトークンを発行した OAuth client_id（リソース URL ではない）。
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(bearerToken)}`
  );
  if (!res.ok) return undefined;

  const info = (await res.json()) as {
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: string | boolean;
    exp?: string;
    scope?: string;
  };

  // confused deputy 対策: 別の Google OAuth アプリのトークンを拒否
  if (!info.aud || !ALLOWED_CLIENT_IDS.includes(info.aud)) return undefined;
  if (info.email_verified !== "true" && info.email_verified !== true) return undefined;
  if (!info.email || !ALLOWED_EMAILS.includes(info.email)) return undefined;

  const authInfo: AuthInfo = {
    token: bearerToken,
    clientId: info.aud,
    scopes: String(info.scope ?? "")
      .split(" ")
      .filter(Boolean),
    expiresAt: info.exp ? Number(info.exp) : undefined, // 秒 epoch。withMcpAuth が失効判定する
    extra: { sub: info.sub, email: info.email },
  };

  setCachedToken(bearerToken, authInfo);
  return authInfo;
}

// ─── ルートエクスポート ────────────────────────────────────────────────────────

const authed = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: RESOURCE_METADATA_PATH,
  // ⚠ withMcpAuth の resourceUrl = オリジン（フル URL を渡すとパスが二重になる）
  resourceUrl: RESOURCE_ORIGIN,
});

export { authed as GET, authed as POST, authed as DELETE };
