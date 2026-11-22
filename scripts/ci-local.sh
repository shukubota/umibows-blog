#!/usr/bin/env bash
# push 前に GitHub Actions（.github/workflows/ci.yml）と同じチェックを手元で流す。
# ci.yml のジョブを足したり変えたりしたら、このスクリプトも合わせて直すこと。
#
#   scripts/ci-local.sh             全部（build 含む）
#   SKIP_BUILD=1 scripts/ci-local.sh  next build だけ省く（ドキュメントだけの変更など）
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

failed=()
log="$(mktemp "${TMPDIR:-/tmp}/ci-local.XXXXXX")"
trap 'rm -f "$log"' EXIT

if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠️  未コミットの変更があります。CI は push したコミットだけを見るので、結果が食い違うことがあります。"
fi

run() {
  local name="$1"
  shift
  echo "▶ ${name}"
  if "$@" >"$log" 2>&1; then
    echo "  ✅ ${name}"
  else
    echo "  ❌ ${name}"
    tail -n 40 "$log" | sed 's/^/    /'
    failed+=("${name}")
  fi
}

# CI と同じく lockfile どおりに入れ直す（手元の node_modules がずれていると結果が CI と食い違う）
run "Install (yarn --frozen-lockfile)" yarn --frozen-lockfile
if ((${#failed[@]})); then
  echo "❌ 依存関係のインストールに失敗したので中断"
  exit 1
fi

# Lint, Format Check, and Build
run "ESLint" yarn lint
run "Prettier" yarn format:check
# Security Scan
run "Security scan" bash .claude/skills/security-scan.sh
# TypeScript Type Check
run "TypeScript" npx tsc --noEmit
# Unit Tests
run "Vitest" yarn test
if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  run "Next build" env ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-dummy-key-for-build}" yarn build
fi

if ((${#failed[@]})); then
  echo ""
  echo "❌ CI 相当のチェックが失敗: ${failed[*]}"
  exit 1
fi
echo ""
echo "✅ CI 相当のチェックをすべて通過"
