/**
 * mahjong-nanikiru : 何切る MCP サーバー（Cloudflare Workers 版）
 *
 * 1つの Worker が認可サーバー（OAuth 2.1）と MCP サーバーを兼ねる。
 *   - /mcp                     … トークン検証済みのリクエストだけ MCP ハンドラへ（src/mcp.ts）
 *   - /authorize, /callback    … 同意画面と Google ログイン（src/google-handler.ts）
 *   - /token, /register, /.well-known/* … workers-oauth-provider が自動で提供
 *
 * 設計: docs/mahjong-nanikiru/remote-mcp-cloudflare-workers.md
 */
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { env } from "cloudflare:workers";
import "./env";
import { GoogleHandler } from "./google-handler";
import { mcpHandler } from "./mcp";

// オプションはモジュール読み込み時に確定するため、vars は cloudflare:workers の env から読む
const resource = env.MCP_RESOURCE;

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: {
    fetch(request, env, ctx) {
      return mcpHandler(request, env, ctx);
    },
  },
  defaultHandler: GoogleHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  // DCR（MCP 仕様では非推奨だが対応クライアントが多い）と CIMD の両方を受け付ける
  clientRegistrationEndpoint: "/register",
  clientIdMetadataDocumentEnabled: true,
  resourceMetadata: {
    resource,
    authorization_servers: [new URL(resource).origin],
    resource_name: "mahjong-nanikiru",
  },
});
