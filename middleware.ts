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
     * - api/mcp (remote MCP endpoints: 独自の共有トークン認証で保護するため
     *            Basic認証の rewrite 対象から外す。MCP クライアントは Basic認証を
     *            送れず、rewrite 先の /api/auth は POST 非対応で 405 になるため)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api/auth|api/mcp|_next/static|_next/image|favicon.ico).*)",
  ],
};
