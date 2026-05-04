# GCP Workload Identity Federation セットアップ

事前に環境変数をセット：

```bash
export GOOGLE_CLOUD_PROJECT_ID=YOUR_PROJECT_ID
export REPO=shukubota/umibows-blog
```

## 1. Workload Identity Pool 作成

```bash
gcloud iam workload-identity-pools create github-pool --location global --project $GOOGLE_CLOUD_PROJECT_ID
```

## 2. OIDC Provider 作成

```bash
gcloud iam workload-identity-pools providers create-oidc github-provider --workload-identity-pool github-pool --location global --issuer-uri "https://token.actions.githubusercontent.com" --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" --attribute-condition "assertion.repository=='${REPO}'" --project $GOOGLE_CLOUD_PROJECT_ID
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

## 5. Pool の完全名を取得

```bash
gcloud iam workload-identity-pools describe github-pool --location global --project $GOOGLE_CLOUD_PROJECT_ID --format "value(name)"
```

出力例: `projects/123456789/locations/global/workloadIdentityPools/github-pool`
→ この値を `POOL_NAME` として次のコマンドに使う。

## 6. WIF → SA バインディング

```bash
gcloud iam service-accounts add-iam-policy-binding "github-actions@${GOOGLE_CLOUD_PROJECT_ID}.iam.gserviceaccount.com" --role roles/iam.workloadIdentityUser --member "principalSet://iam.googleapis.com/POOL_NAME/attribute.repository/${REPO}" --project $GOOGLE_CLOUD_PROJECT_ID
```

※ `POOL_NAME` は手順5の出力値に置き換える。

## 7. WIF_PROVIDER の値を確認（GitHub Secretsに登録する値）

```bash
gcloud iam workload-identity-pools providers describe github-provider --workload-identity-pool github-pool --location global --project $GOOGLE_CLOUD_PROJECT_ID --format "value(name)"
```

出力例: `projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider`

## 8. Artifact Registry リポジトリ作成

```bash
gcloud artifacts repositories create igo-api --repository-format docker --location asia-northeast1 --project $GOOGLE_CLOUD_PROJECT_ID
```

## 9. GitHub Secrets に登録

まず gh CLI にログイン（未認証の場合）：

```bash
gh auth login
```

Secretを登録：

```bash
GH_TOKEN=$gh_access_token gh secret set WIF_PROVIDER --body "projects/899188349213/locations/global/workloadIdentityPools/github-pool/providers/github-provider" --repo shukubota/umibows-blog
```

```bash
GH_TOKEN=$gh_access_token gh secret set GCP_PROJECT_ID --body "$GOOGLE_CLOUD_PROJECT_ID" --repo shukubota/umibows-blog
```

## 10. デプロイ確認

mainブランチに push すると `.github/workflows/deploy-igo-api.yml` が動く。
Cloud Run の URL を Vercel の環境変数 `IGO_API_URL` に設定して完了。
