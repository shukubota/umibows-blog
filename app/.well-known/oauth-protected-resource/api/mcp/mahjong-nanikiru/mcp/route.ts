/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata
 *
 * ⚠ §7.3 確認済み NG: Google の token エンドポイントが RFC 8707 の `resource` パラメータを
 *   拒否する（400 Bad Request）。MCP SDK は PRM が存在すると authorize / token 両リクエストに
 *   `resource=` を付与するため、PRM を有効にすると認証フロー全体が失敗する。
 *
 * 代替: /.well-known/openid-configuration を露出し、mcp-remote に Google の OIDC エンドポイントを
 *   直接 discovery させる。この経路では SDK が resource を送らない（resourceMetadata が
 *   undefined のとき selectResourceURL が undefined を返す → resource パラメータ不送信）。
 *
 * → このエンドポイントは意図的に 404 を返す。
 */
export function GET() {
  return new Response(null, { status: 404 });
}

export function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
