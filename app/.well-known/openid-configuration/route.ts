/**
 * OIDC Discovery プロキシ — Google の authorization / token エンドポイントを mcp-remote に教える
 *
 * §7.3 ワークアラウンド:
 *   PRM (RFC 9728) を使うと MCP SDK が resource パラメータを token リクエストに付与し、
 *   Google が 400 Bad Request を返す。そのため PRM の代わりにこのエンドポイントで
 *   Google の OIDC metadata を返す。
 *
 *   mcp-remote の discovery フロー:
 *     1. /.well-known/oauth-protected-resource/... → 404（意図的）
 *     2. /.well-known/oauth-authorization-server  → 404
 *     3. /.well-known/openid-configuration        → ✅ Google のエンドポイントを返す
 *
 *   この経路では resourceMetadata が undefined のまま selectResourceURL に渡るため、
 *   SDK は resource パラメータを authorize / token リクエストに追加しない。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const res = await fetch("https://accounts.google.com/.well-known/openid-configuration");

  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch OIDC configuration from Google" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const data = await res.json();

  return Response.json(data, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "max-age=3600",
    },
  });
}
