/**
 * MCP Apps ホスト接続層（iframe 側）。
 *
 * 公式 SDK でホストへ接続し、ツール結果(何切る解析)を受け取る。
 * - handPromise : 最初のツール結果を解決する Promise。React 側は use(handPromise) で
 *   Suspense のローディング境界に載せる。
 * - subscribe   : 2回目以降のツール結果（ホストがツールを再実行した場合）を購読する。
 *
 * ホスト未接続（ファイル単体で開いた等）のときだけ、少し待ってからサンプル手牌で解決する。
 */
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Hand } from "./model";

function extract(result: CallToolResult): Hand | null {
  const h = result.structuredContent as Hand | undefined;
  return h && Array.isArray(h.tiles) ? h : null;
}

let resolveFirst!: (h: Hand) => void;
/** 最初の手牌。Suspense 用。 */
export const handPromise = new Promise<Hand>((res) => {
  resolveFirst = res;
});

let received = false;
const subscribers = new Set<(h: Hand) => void>();

/** 2回目以降の手牌更新を購読する。戻り値で解除。 */
export function subscribe(cb: (h: Hand) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function push(h: Hand) {
  if (!received) {
    received = true;
    resolveFirst(h);
  } else {
    for (const cb of subscribers) cb(h);
  }
}

const app = new App({ name: "Nanikiru", version: "0.5.0" });

app.ontoolresult = (result) => {
  const h = extract(result);
  if (h) push(h);
};

app.onhostcontextchanged = (ctx: McpUiHostContext) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
};

app.onerror = console.error;

let connected = false;
app
  .connect()
  .then(() => {
    connected = true;
    const ctx = app.getHostContext();
    if (ctx?.theme) applyDocumentTheme(ctx.theme);
  })
  .catch(() => {});

// ホスト接続済みならツール結果が届くまで Suspense のローディングを維持する。
// 未接続（単体表示）のときだけ、デモ手牌で解決してプレビューできるようにする。
const DEMO: Hand = {
  tiles: [2, 3, 4, 9, 10, 11, 15, 16, 17, 22, 32, 32, 33, 33],
  names: ["3m", "4m", "5m", "1p", "2p", "3p", "7p", "8p", "9p", "5s", "發", "發", "中", "中"],
  count: 14,
  shanten: 0,
  mode: "discard",
  recommend: [{ index: 22, name: "5s", shanten: 0, ukeire: 4 }],
  unknown: [],
};
setTimeout(() => {
  if (!received && !connected) push(DEMO);
}, 800);
