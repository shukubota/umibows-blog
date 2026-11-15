#!/usr/bin/env bash
# Claude Code の PreToolUse フック（.claude/settings.json から呼ばれる）。
# Bash で `git push` しようとしたら、先に scripts/ci-local.sh（GitHub Actions と同じチェック）を流し、
# 失敗したら exit 2 で push を止めて、失敗内容を Claude に返す。
#
# 判定は「取りこぼさない」側に倒している。引用符の中を除いたコマンドに単語 git と push が
# 両方あれば実行する（`git push;` や `/usr/bin/git -c k=v push` も拾う）。
# 誤って拾った場合はチェックが1回余分に走るだけ。
set -uo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "push 前チェックのフックに jq が必要です（brew install jq）。" >&2
  exit 2
fi

cmd="$(jq -r '.tool_input.command // ""')"
# "..." と '...' の中身を除く（コミットメッセージ中の push などで反応しないように）
unquoted="$(sed -E "s/\"[^\"]*\"//g; s/'[^']*'//g" <<<"$cmd")"

word() { grep -Eq "(^|[^[:alnum:]_-])$1([^[:alnum:]_-]|\$)" <<<"$unquoted"; }
if ! { word git && word push; }; then
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
