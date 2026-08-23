import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // Basic認証が有効な場合のみ実行
  if (!process.env.BASIC_AUTH_ENABLED || process.env.BASIC_AUTH_ENABLED !== "true") {
    return NextResponse.next();
  }

  const basicAuth = request.headers.get("authorization");
  const url = request.nextUrl;

  if (basicAuth) {
    const authValue = basicAuth.split(" ")[1];
    const [user, pwd] = atob(authValue).split(":");

    const validUser = process.env.BASIC_AUTH_USER || "admin";
    const validPassword = process.env.BASIC_AUTH_PASSWORD || "password";

    if (user === validUser && pwd === validPassword) {
      return NextResponse.next();
    }
  }

  url.pathname = "/api/auth";

  return NextResponse.rewrite(url);
}

// 認証を適用するパスを指定
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (authentication endpoint)
     * - api/mcp (remote MCP endpoints: Google OAuth / 共有トークンで保護するため
     *            Basic認証の rewrite 対象から外す。MCP クライアントは Basic認証を
     *            送れず、rewrite 先の /api/auth は POST 非対応で 405 になるため)
     * - .well-known (RFC 9728 Protected Resource Metadata: MCP クライアントが
     *               認可サーバーを discovery するために参照するエンドポイント。
     *               Basic認証で弾くと MCP の OAuth フローが開始できなくなるため)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api/auth|api/mcp|\\.well-known|_next/static|_next/image|favicon.ico).*)",
  ],
};
