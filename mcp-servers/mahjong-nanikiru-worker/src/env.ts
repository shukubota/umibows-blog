import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

/**
 * Worker のバインディング。wrangler.jsonc の vars / kv と `wrangler secret` で入る値。
 * Cloudflare.Env を拡張しておくと OAuthProvider の既定ジェネリクスと `cloudflare:workers` の env に効く。
 */
declare global {
  namespace Cloudflare {
    interface Env {
      /** クライアント・付与・トークン（ハッシュ）・同意トランザクションの保存先 */
      OAUTH_KV: KVNamespace;
      /** OAuthProvider が defaultHandler に注入するヘルパー */
      OAUTH_PROVIDER: OAuthHelpers;
      /** MCP エンドポイントの正規 URL（例: https://mahjong-nanikiru.xxx.workers.dev/mcp） */
      MCP_RESOURCE: string;
      GOOGLE_CLIENT_ID: string;
      GOOGLE_CLIENT_SECRET: string;
      /** 同意の記憶クッキー署名用（32文字以上） */
      COOKIE_ENCRYPTION_KEY: string;
      /** カンマ区切りの許可メールアドレス */
      ALLOWED_EMAILS: string;
    }
  }
}

export type Env = Cloudflare.Env;

/** completeAuthorization で保存し、/mcp のハンドラに ctx.props として渡る値（KV 上は暗号化） */
export type Props = {
  sub: string;
  email: string;
  name?: string;
};
