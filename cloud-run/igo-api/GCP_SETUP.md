# GCP Workload Identity Federation セットアップ

事前に環境変数をセット：

```bash
export GOOGLE_CLOUD_PROJECT_ID=YOUR_PROJECT_ID
```

## 1. Workload Identity Pool 作成

```bash
gcloud iam workload-identity-pools create github-pool --location global --project $GOOGLE_CLOUD_PROJECT_ID
```

## 2. OIDC Provider 作成

⚠️ `--attribute-condition` はシェル変数を使わず、リポジトリ名をリテラルで直接書くこと（変数未設定だと空になって認証が全て拒否される）。

```bash
gcloud iam workload-identity-pools providers create-oidc github-provider --workload-identity-pool github-pool --location global --issuer-uri "https://token.actions.githubusercontent.com" --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" --attribute-condition "assertion.repository=='shukubota/umibows-blog'" --project $GOOGLE_CLOUD_PROJECT_ID
```

## 3. Service Account 作成

```bash
gcloud iam service-accounts create github-actions --project $GOOGLE_CLOUD_PROJECT_ID
```

## 4. ロール付与（3回実行）

```bash
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT_ID --member "serviceAccount:github-actions@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com" --role roles/run.developer
```

```bash
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT_ID --member "serviceAccount:github-actions@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com" --role roles/artifactregistry.writer
```

```bash
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT_ID --member "serviceAccount:github-actions@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com" --role roles/iam.serviceAccountUser
```

## 5. WIF → SA バインディング

Pool名をコマンド内で取得してそのまま使う（手動コピー不要）：

```bash
gcloud iam service-accounts add-iam-policy-binding "github-actions@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com" --role roles/iam.workloadIdentityUser --member "principalSet://iam.googleapis.com/$(gcloud iam workload-identity-pools describe github-pool --location global --project $GOOGLE_CLOUD_PROJECT_ID --format 'value(name)')/attribute.repository/shukubota/umibows-blog" --project $GOOGLE_CLOUD_PROJECT_ID
```

## 6. WIF_PROVIDER の値を確認（GitHub Secretsに登録する値）

```bash
gcloud iam workload-identity-pools providers describe github-provider --workload-identity-pool github-pool --location global --project $GOOGLE_CLOUD_PROJECT_ID --format "value(name)"
```

出力例: `projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider`

## 7. Artifact Registry リポジトリ作成

```bash
gcloud artifacts repositories create igo-api --repository-format docker --location asia-northeast1 --project $GOOGLE_CLOUD_PROJECT_ID
```

## 8. GitHub Secrets に登録

`gh auth login` はOrganizationにも権限が広がるため、Fine-grained PATを使う：

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token
2. Resource owner: `shukubota`（個人アカウント）
3. Repository access: Only select repositories → `umibows-blog`
4. Permissions: Repository permissions → Secrets → **Read and write**

```bash
GH_TOKEN=YOUR_FINE_GRAINED_PAT gh secret set WIF_PROVIDER --body "$(gcloud iam workload-identity-pools providers describe github-provider --workload-identity-pool github-pool --location global --project $GOOGLE_CLOUD_PROJECT_ID --format 'value(name)')" --repo shukubota/umibows-blog
```

```bash
GH_TOKEN=YOUR_FINE_GRAINED_PAT gh secret set GCP_PROJECT_ID --body "$GOOGLE_CLOUD_PROJECT_ID" --repo shukubota/umibows-blog
```

## 9. デプロイ確認

mainブランチに push すると `.github/workflows/deploy-igo-api.yml` が動く。
Cloud Run の URL を Vercel の環境変数 `IGO_API_URL` に設定して完了。
