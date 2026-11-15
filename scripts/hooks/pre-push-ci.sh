#!/usr/bin/env bash
# Claude Code の PreToolUse フック（.claude/settings.json から呼ばれる）。
# Bash で `git push` しようとしたら、先に scripts/ci-local.sh（GitHub Actions と同じチェック）を流し、
# 失敗したら exit 2 で push を止めて、失敗内容を Claude に返す。
set -uo pipefail

cmd="$(jq -r '.tool_input.command // ""')"

# git push を含まないコマンドは素通り
if ! grep -Eq '(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push([[:space:]]|$)' <<<"$cmd"; then
  exit 0
fi

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
if ! out="$("$root/scripts/ci-local.sh" 2>&1)"; then
  {
    echo "push を止めました: CI 相当のチェック（scripts/ci-local.sh）が失敗しています。直してから push してください。"
    echo "$out" | tail -n 60
  } >&2
  exit 2
fi
exit 0
