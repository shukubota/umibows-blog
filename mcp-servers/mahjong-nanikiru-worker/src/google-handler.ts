/**
 * defaultHandler: /authorize（同意画面）と /callback（Google からの戻り）。
 *
 * 認可サーバーは Worker 自身（OAuthProvider）。Google は本人確認にだけ使い、
 * MCP 用トークンは completeAuthorization で Worker が発行する。
 *
 * CSRF・state のブラウザ紐付け・使い捨ては workers-oauth-provider の
 * beginConsent / approveConsent / beginUpstream / finishUpstream に任せる。
 * このファイル固有の責務は「同意画面の描画」「Google との code 交換」「メール許可リスト判定」。
 */
import {
  AuthorizationError,
  authorizationErrorRedirect,
  CimdFetchError,
  type AuthRequest,
  type ConsentDescription,
} from "@cloudflare/workers-oauth-provider";
import type { Env, Props } from "./env";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

type UpstreamData = { verifier: string };

type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

export const GoogleHandler: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/authorize" && request.method === "GET") {
        return await showConsent(request, env);
      }
      if (url.pathname === "/authorize" && request.method === "POST") {
        return await submitConsent(request, env);
      }
      if (url.pathname === "/callback" && request.method === "GET") {
        return await handleCallback(request, env);
      }
      if (url.pathname === "/") {
        return text("mahjong-nanikiru MCP server. Endpoint: /mcp", 200);
      }
      return text("Not found", 404);
    } catch (error) {
      // 検証済みのクライアント・redirect_uri があるときだけクライアントへ戻す。それ以外はここで表示する。
      if (error instanceof AuthorizationError && error.redirectTo) {
        return Response.redirect(error.redirectTo, 302);
      }
      if (error instanceof AuthorizationError) {
        return text(`認可に失敗しました: ${error.description}`, 400);
      }
      if (error instanceof CimdFetchError) {
        return text("クライアントのメタデータを取得できませんでした。", 400);
      }
      throw error;
    }
  },
};

// ─── /authorize ──────────────────────────────────────────────────────────────

async function showConsent(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const authRequest = await oauth.parseAuthRequest(request);
  const details = await oauth.describeConsent(authRequest);

  // このブラウザで同じクライアントを承認済みなら同意画面を飛ばして Google へ
  if (
    await oauth.isConsentRemembered(request, authRequest, { secret: env.COOKIE_ENCRYPTION_KEY })
  ) {
    return redirectToGoogle(request, env, authRequest, new Headers());
  }

  const consent = await oauth.beginConsent(authRequest);
  consent.headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(consentPage(details, consent.handle), { headers: consent.headers });
}

async function submitConsent(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const form = await request.formData();
  const handle = String(form.get("handle") ?? "");

  if (form.get("decision") !== "approve") {
    const denied = await oauth.denyConsent(request, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  }

  const approved = await oauth.approveConsent(request, handle, {
    remember: { secret: env.COOKIE_ENCRYPTION_KEY },
  });
  return redirectToGoogle(request, env, approved.request, approved.headers);
}

/** 同意済みのリクエストを保存し、PKCE 付きで Google のログインへ送る */
async function redirectToGoogle(
  request: Request,
  env: Env,
  authRequest: AuthRequest,
  headers: Headers
): Promise<Response> {
  const verifier = randomString(32);
  const { state, headers: upstreamHeaders } = await env.OAUTH_PROVIDER.beginUpstream(authRequest, {
    data: { verifier } satisfies UpstreamData,
    headers,
  });

  const google = new URL(GOOGLE_AUTHORIZE_URL);
  google.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  google.searchParams.set("redirect_uri", callbackUrl(request));
  google.searchParams.set("response_type", "code");
  google.searchParams.set("scope", "openid email profile");
  google.searchParams.set("state", state);
  google.searchParams.set("code_challenge", await s256(verifier));
  google.searchParams.set("code_challenge_method", "S256");
  google.searchParams.set("prompt", "select_account");

  upstreamHeaders.set("Location", google.href);
  return new Response(null, { status: 302, headers: upstreamHeaders });
}

// ─── /callback ───────────────────────────────────────────────────────────────

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const params = new URL(request.url).searchParams;
  const { request: original, data, headers } = await oauth.finishUpstream<UpstreamData>(request);

  const deny = (description: string) => {
    headers.set("Location", authorizationErrorRedirect(original, "access_denied", description));
    return new Response(null, { status: 302, headers });
  };

  // Google 側で拒否・失敗した
  if (params.get("error")) return deny("Google sign-in was not completed");

  const code = params.get("code");
  if (!code) return deny("Missing authorization code from Google");

  const user = await fetchGoogleUser(request, env, code, data.verifier);
  if (!user) return deny("Google sign-in failed");

  // 許可リスト外の人には MCP 用トークンを発行しない
  const allowed = parseList(env.ALLOWED_EMAILS);
  if (!user.email || user.email_verified !== true || !allowed.includes(user.email.toLowerCase())) {
    return deny("This Google account is not allowed to use this server");
  }

  const props: Props = { sub: user.sub, email: user.email, name: user.name };
  const { redirectTo } = await oauth.completeAuthorization({
    request: original,
    // ライブラリはトークンを `userId:grantId:secret` で組み立てるため ":" を使えない
    userId: `google-${user.sub}`,
    metadata: { email: user.email },
    scope: original.scope,
    props,
  });
  headers.set("Location", redirectTo);
  return new Response(null, { status: 302, headers });
}

/** Google の code をトークンに交換し、userinfo を返す。Google のトークンは保存しない。 */
async function fetchGoogleUser(
  request: Request,
  env: Env,
  code: string,
  verifier: string
): Promise<GoogleUserInfo | null> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl(request),
    }),
  });
  if (!tokenRes.ok) {
    console.error("google token exchange failed", tokenRes.status);
    return null;
  }
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return null;

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) {
    console.error("google userinfo failed", userRes.status);
    return null;
  }
  return (await userRes.json()) as GoogleUserInfo;
}

// ─── 同意画面 ─────────────────────────────────────────────────────────────────

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** 表示する文字列はクライアントが自己申告したものなので、すべてエスケープする */
function consentPage(details: ConsentDescription, handle: string): string {
  const name = escape(details.clientName);
  const origin = details.clientDomain
    ? `発行元: <strong>${escape(details.clientDomain)}</strong>`
    : "このアプリは自己登録されたもので、名前は検証されていません。";
  const loopback = details.redirectIsLoopback
    ? '<p class="warn">アクセス権はこのコンピューター上のアプリに送られます。自分でサインインを始めた場合だけ続けてください。</p>'
    : "";
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} を許可しますか？</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 48px auto; padding: 0 16px; line-height: 1.6; }
  .warn { padding: 8px 12px; border-left: 4px solid #d97706; background: rgba(217, 119, 6, 0.1); }
  button { font-size: 1rem; padding: 8px 20px; margin-right: 8px; cursor: pointer; }
</style>
</head>
<body>
<h1>何切る MCP</h1>
<p><strong>${name}</strong> が何切る MCP サーバーへのアクセスを求めています。</p>
<p>${origin}<br>アクセス権の送り先: <strong>${escape(details.redirectHost)}</strong></p>
${loopback}
<p>許可すると Google でのログインに進みます。許可されたアカウント以外は利用できません。</p>
<form method="post">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <button name="decision" value="approve">許可して Google でログイン</button>
  <button name="decision" value="deny">拒否</button>
</form>
</body>
</html>`;
}

// ─── ユーティリティ ───────────────────────────────────────────────────────────

function callbackUrl(request: Request): string {
  return new URL("/callback", request.url).href;
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(byteLength: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}
