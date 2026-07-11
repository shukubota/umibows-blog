/**
 * View（iframe）: 何切る。MCP Apps 公式 SDK でホストと接続し、
 * ツール結果(手牌+解析)を受け取って牌SVGを描画する。
 * 牌SVGは FluffyStuff / riichi-mahjong-tiles (CC0)。
 */
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TILE_SVGS } from "./tiles";

type Reco = { index: number; name: string; shanten: number; ukeire: number };
type Hand = {
  tiles: number[];
  names: string[];
  count: number;
  shanten: number;
  mode: "discard" | "improve" | "complete" | "invalid";
  recommend: Reco[];
  unknown: string[];
};

const appEl = document.getElementById("app")!;

function tileHTML(i: number): string {
  return `<span class="t">${TILE_SVGS[i] ?? ""}</span>`;
}

function render(h: Hand) {
  if (h.mode === "invalid") {
    appEl.innerHTML = `<div class="warn">手牌が${h.count}枚です。13枚か14枚で指定してください。</div>
      <div class="hand">${h.tiles.map(tileHTML).join("")}</div>`;
    return;
  }

  const handRow = `<div class="label">手牌（${h.count}枚）</div>
    <div class="hand">${h.tiles.map(tileHTML).join("")}</div>`;

  let meta = "";
  let recoBlock = "";
  if (h.mode === "complete") {
    meta = `<div class="meta">和了形です 🎉</div>`;
  } else if (h.mode === "discard") {
    meta = `<div class="meta">シャンテン: ${h.shanten}（何切る＝打牌候補）</div>`;
    recoBlock = `<div class="label">推奨打牌（受け入れ最大）</div>
      <div class="recos">${h.recommend
        .map(
          (r) =>
            `<div class="reco">${tileHTML(r.index)}<div class="u">受 ${r.ukeire} 枚</div></div>`,
        )
        .join("")}</div>`;
  } else {
    meta = `<div class="meta">シャンテン: ${h.shanten}</div>`;
    recoBlock = `<div class="label">受け入れ牌</div>
      <div class="recos">${h.recommend
        .map((r) => `<div class="reco">${tileHTML(r.index)}<div class="u">${r.ukeire} 枚</div></div>`)
        .join("")}</div>`;
  }

  const warn = h.unknown.length
    ? `<div class="warn">未認識のコード: ${h.unknown.join(", ")}</div>`
    : "";

  appEl.innerHTML = handRow + meta + recoBlock + warn;
}

function extract(result: CallToolResult): Hand | null {
  const h = result.structuredContent as Hand | undefined;
  return h && Array.isArray(h.tiles) ? h : null;
}

let rendered = false;

const app = new App({ name: "Nanikiru", version: "0.4.0" });

app.ontoolresult = (result) => {
  const h = extract(result);
  if (h) { rendered = true; render(h); }
};

app.onhostcontextchanged = (ctx: McpUiHostContext) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
};

app.onerror = console.error;

let connected = false;

app.connect().then(() => {
  connected = true;
  const ctx = app.getHostContext();
  if (ctx?.theme) applyDocumentTheme(ctx.theme);
}).catch(() => {});

// ホスト未接続（ファイル単体で開いた等）のときだけ、サンプル手牌でデモ描画する。
// ホスト接続済みならツール結果が届くまでローディング表示（hand.html の初期表示）を維持する。
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
  if (!rendered && !connected) render(DEMO);
}, 800);
