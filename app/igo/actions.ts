"use server";

import { Grid, Point, StoneColor } from "@/hooks/go/engine";

const IGO_API_URL = process.env.IGO_API_URL ?? "http://localhost:8080";
const GCP_WIF_PROVIDER = process.env.GCP_WIF_PROVIDER ?? "";
const GCP_SERVICE_ACCOUNT = process.env.GCP_SERVICE_ACCOUNT ?? "";

const isLocal = IGO_API_URL.startsWith("http://localhost");

async function getIdToken(): Promise<string> {
  if (isLocal) return "";

  const { getVercelOidcToken } = await import("@vercel/oidc");
  const { IdentityPoolClient } = await import("google-auth-library");

  const vercelToken = await getVercelOidcToken();

  // WIF経由でSAのアクセストークンを取得
  const client = new IdentityPoolClient({
    audience: `//iam.googleapis.com/${GCP_WIF_PROVIDER}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    subject_token_supplier: { getSubjectToken: async () => vercelToken },
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${GCP_SERVICE_ACCOUNT}:generateAccessToken`,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const { token: accessToken } = await client.getAccessToken();

  // SAのアクセストークンでCloud Run用のID Tokenを生成
  const resp = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${GCP_SERVICE_ACCOUNT}:generateIdToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ audience: IGO_API_URL, includeEmail: true }),
    }
  );

  if (!resp.ok) throw new Error(`generateIdToken failed: ${resp.status}`);
  const { token } = (await resp.json()) as { token: string };
  return token;
}

export async function warmupModel(): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (!isLocal) headers["Authorization"] = `Bearer ${await getIdToken()}`;
    const res = await fetch(`${IGO_API_URL}/health`, { headers, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function computeCpuMoveNN(
  grid: Grid,
  color: StoneColor,
  previousGrid: Grid | null
): Promise<Point | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!isLocal) headers["Authorization"] = `Bearer ${await getIdToken()}`;

  const res = await fetch(`${IGO_API_URL}/predict`, {
    method: "POST",
    headers,
    body: JSON.stringify({ grid, color, previousGrid }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`igo-api predict failed: ${res.status}`);
  const { move } = (await res.json()) as { move: Point | null };
  return move;
}
