# Cloud Run 認証設計：Vercel → Cloud Run ID Token認証

## 方式比較

| | 方式A: SA Key | 方式B: WIF（推奨） |
|---|---|---|
| 長期クレデンシャル | **あり**（漏洩リスク） | **なし** |
| Vercel環境変数の秘密情報 | SA Key JSON全体 | なし（WIF設定ファイルは公開可） |
| トークン有効期限 | 1時間のID Token | 数分の短命トークン |
| セットアップ難易度 | 低 | 中 |

> **方式Bが本命。方式Aは比較のための参考実装。**

---

## 方式B: WIF（Workload Identity Federation）

### 概要

GitHub Actions → GCPでWIFを使ったのと同じ考え方。VercelもOIDCトークンを発行できるので、SA Keyを持たずにCloud Runを呼べる。

```
Vercel Server Action
  → @vercel/oidc: Vercel OIDCトークン取得（短命、Vercelが自動発行）
  → GCP Security Token Service: OIDCトークン → 連合トークンに交換
  → GCP IAM: vercel-igo-invoker SAをimpersonateしてCloud Run用ID Token取得
  → fetch(Cloud Run, { Authorization: Bearer <id_token> })
  → Cloud RunがGoogleの公開鍵でトークンを検証
  → 200 OK
```

### GCP側の追加設定（方式Aの1〜3に加えて）

#### Vercel用WIF Poolを作成

```bash
gcloud iam workload-identity-pools create vercel-pool --location global --project $GOOGLE_CLOUD_PROJECT_ID
```

#### Vercel OIDC Providerを追加

```bash
gcloud iam workload-identity-pools providers create-oidc vercel-provider --workload-identity-pool vercel-pool --location global --issuer-uri "https://oidc.vercel.com/shukubotas-projects" --attribute-mapping "google.subject=assertion.sub,attribute.environment=assertion.environment" --allowed-audiences "https://vercel.com/YOUR_TEAM_SLUG" --project $GOOGLE_CLOUD_PROJECT_ID
```

#### WIF → SAのバインディング

```bash
gcloud iam service-accounts add-iam-policy-binding "vercel-igo-invoker@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com" --role roles/iam.workloadIdentityUser --member "principalSet://iam.googleapis.com/$(gcloud iam workload-identity-pools describe vercel-pool --location global --project $GOOGLE_CLOUD_PROJECT_ID --format 'value(name)')/attribute.environment/production" --project $GOOGLE_CLOUD_PROJECT_ID
```

### Vercel側の設定

`@vercel/oidc` はVercel環境で自動的にOIDCトークンを発行する公式パッケージ。環境変数への秘密情報の追加は不要。

必要な環境変数：

| 変数名 | 値 |
|---|---|
| `IGO_API_URL` | `https://igo-api-fo4po2vqhq-an.a.run.app` |
| `GCP_WIF_PROVIDER` | `projects/899188349213/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider` |
| `GCP_SERVICE_ACCOUNT` | `vercel-igo-invoker@empowerme-bb3c5.iam.gserviceaccount.com` |

### コード変更（方式B）

```bash
yarn add @vercel/oidc google-auth-library
```

```typescript
"use server";

import { awaitVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";
import { Grid, Point, StoneColor } from "@/hooks/go/engine";

const IGO_API_URL = process.env.IGO_API_URL ?? "http://localhost:8080";

async function getIdToken(): Promise<string> {
  // Vercel OIDCトークンを取得
  const vercelToken = await awaitVercelOidcToken();

  // WIF設定でGCPクライアントを初期化
  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/${process.env.GCP_WIF_PROVIDER}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    subject_token_supplier: { getSubjectToken: () => Promise.resolve(vercelToken) },
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GCP_SERVICE_ACCOUNT}:generateIdToken`,
  });

  // Cloud Run用ID Tokenを取得（audienceはCloud Run URL）
  const idTokenClient = await client.fetchIdToken(IGO_API_URL);
  return idTokenClient;
}
```

### 方式Bのセキュリティポイント

- Vercel環境変数に**秘密情報がゼロ**（WIF Provider名とSAメールは公開可）
- Vercel OIDCトークンは**数分で失効**し、attribute.environmentがproductionに固定されているのでプレビューデプロイからは呼べない
- SA Keyの漏洩リスクが構造的に存在しない

---

## 方式A: SA Key（参考）

### 概要

Cloud Runを認証必須にして、VercelのServer ActionがGoogleのID Tokenを取得してから呼び出す設計。

```
Vercel Server Action
  → google-auth-library（SA Keyを使用）
  → Google OAuth2エンドポイント
  → ID Token（短命、audience = Cloud Run URL）
  → fetch(Cloud Run, { Authorization: Bearer <token> })
  → Cloud RunがGoogleの公開鍵でトークンを検証
  → 200 OK
```

---

## 登場人物

| 役割 | 内容 |
|---|---|
| Cloud Run | 認証必須（`--no-allow-unauthenticated`）のAPIサーバー |
| Service Account | `vercel-igo-invoker` — Cloud Runを呼ぶ権限だけを持つ |
| SA Key JSON | Vercelの環境変数に置く秘密鍵 |
| ID Token | SA Keyから生成する短命トークン（有効期限1時間）。audienceはCloud RunのURL |
| google-auth-library | Node.js SDKでID Tokenを取得するライブラリ |

---

## GCP側の設定

### 1. allUsersを削除してCloud Runを認証必須に戻す

```bash
gcloud run services remove-iam-policy-binding igo-api \
  --region asia-northeast1 \
  --member allUsers \
  --role roles/run.invoker \
  --project $GOOGLE_CLOUD_PROJECT_ID
```

### 2. Vercel専用のService Account作成

```bash
gcloud iam service-accounts create vercel-igo-invoker \
  --project $GOOGLE_CLOUD_PROJECT_ID
```

### 3. Cloud Runの呼び出し権限だけを付与

```bash
gcloud run services add-iam-policy-binding igo-api \
  --region asia-northeast1 \
  --member "serviceAccount:vercel-igo-invoker@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/run.invoker \
  --project $GOOGLE_CLOUD_PROJECT_ID
```

### 4. SA Key JSONを発行

```bash
gcloud iam service-accounts keys create /tmp/vercel-igo-invoker-key.json \
  --iam-account "vercel-igo-invoker@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com" \
  --project $GOOGLE_CLOUD_PROJECT_ID

cat /tmp/vercel-igo-invoker-key.json
```

---

## Vercel側の設定

Vercelのダッシュボード or CLIで環境変数を追加：

| 変数名 | 値 |
|---|---|
| `GOOGLE_SA_KEY` | SA Key JSONの中身（全体をそのままペースト） |
| `IGO_API_URL` | `https://igo-api-fo4po2vqhq-an.a.run.app`（変更なし） |

---

## コード変更

### package.json

```bash
yarn add google-auth-library
```

### app/igo/actions.ts

```typescript
"use server";

import { GoogleAuth } from "google-auth-library";
import { Grid, Point, StoneColor } from "@/hooks/go/engine";

const IGO_API_URL = process.env.IGO_API_URL ?? "http://localhost:8080";

async function getIdToken(): Promise<string> {
  const credentials = JSON.parse(process.env.GOOGLE_SA_KEY ?? "{}");
  const auth = new GoogleAuth({ credentials });
  const client = await auth.getIdTokenClient(IGO_API_URL);
  const headers = await client.getRequestHeaders();
  return headers["Authorization"].replace("Bearer ", "");
}

export async function warmupModel(): Promise<boolean> {
  try {
    const token = await getIdToken();
    const res = await fetch(`${IGO_API_URL}/health`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
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
  const token = await getIdToken();
  const res = await fetch(`${IGO_API_URL}/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ grid, color, previousGrid }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`igo-api predict failed: ${res.status}`);

  const { move } = (await res.json()) as { move: Point | null };
  return move;
}
```

---

## セキュリティ上のポイント

- SA Keyはプロジェクト全体ではなく **Cloud Run Invokerのみ** の最小権限
- ID Tokenは **1時間で失効** し、audienceがCloud Run URLに固定されているので他のサービスには使えない
- ローカル開発時は `IGO_API_URL=http://localhost:8080` のままなのでトークン不要（getIdTokenがエラーになるが warmupModel は握りつぶす）
- SA Key JSONは長期クレデンシャルなので `.gitignore` に入れる（Vercelの環境変数にのみ置く）

---

## ローカル開発の注意

`GOOGLE_SA_KEY` がない場合 `getIdToken()` は失敗するが、warmupModelはbooleanを返すだけなので問題なし。  
`computeCpuMoveNN` は失敗する → ローカルではCloud RunではなくローカルのAPIサーバーを立てるか、認証なしのURLを使う。

```bash
# ローカルで動かす場合
cd cloud-run/igo-api
npm install
npm run build
node dist/server.js
# → localhost:8080 で認証なしで動く
```
