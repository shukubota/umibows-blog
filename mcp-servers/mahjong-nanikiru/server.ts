/**
 * mahjong-nanikiru : 何切る MCP Apps サーバー（公式 ext-apps 準拠）
 *
 * show_mahjong_hand ツールに手牌(牌コード配列)を渡すと、
 *   - シャンテン数・受け入れ・推奨打牌を計算し
 *   - ui://mahjong-nanikiru/hand.html（牌SVGを描画するView）で表示する
 *
 * 牌コード: 1m..9m / 1p..9p / 1s..9s / 字牌 ton,nan,sha,pei(東南西北), haku,hatsu,chun(白發中)
 * 自然言語のあいまいな手牌表現は、呼び出すLLM側でこのコード配列に変換してから渡す。
 */
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const ROOT = import.meta.filename.endsWith(".ts")
  ? import.meta.dirname
  : path.join(import.meta.dirname, "..");

// index 0-33 = 1m..9m, 1p..9p, 1s..9s, 東南西北白發中
const NAMES = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "6m",
  "7m",
  "8m",
  "9m",
  "1p",
  "2p",
  "3p",
  "4p",
  "5p",
  "6p",
  "7p",
  "8p",
  "9p",
  "1s",
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s",
  "東",
  "南",
  "西",
  "北",
  "白",
  "發",
  "中",
];

// 牌コード → index。表記ゆれにある程度寛容にする
const HONOR: Record<string, number> = {
  ton: 27,
  east: 27,
  e: 27,
  東: 27,
  nan: 28,
  south: 28,
  s: 28,
  南: 28,
  sha: 29,
  shaa: 29,
  west: 29,
  w: 29,
  西: 29,
  pei: 30,
  north: 30,
  n: 30,
  北: 30,
  haku: 31,
  white: 31,
  白: 31,
  hatsu: 32,
  green: 32,
  發: 32,
  発: 32,
  chun: 33,
  red: 33,
  中: 33,
};

function codeToIndex(raw: string): number | null {
  const c = raw.trim().toLowerCase();
  const m = c.match(/^([1-9])([mps])$/);
  if (m) {
    const n = Number(m[1]) - 1;
    return m[2] === "m" ? n : m[2] === "p" ? n + 9 : n + 18;
  }
  if (c in HONOR) return HONOR[c];
  if (raw.trim() in HONOR) return HONOR[raw.trim()];
  return null;
}

// ---- シャンテン/受け入れ計算（何切るメーカーのロジックを移植）----
function shantenNormal(src: number[]): number {
  const c = src.slice();
  let best = 8;
  function rec(i: number, m: number, t: number, h: boolean) {
    while (i < 34 && c[i] === 0) i++;
    if (i === 34) {
      const sh = 8 - 2 * m - t - (h ? 1 : 0);
      if (sh < best) best = sh;
      return;
    }
    if (c[i] >= 3 && m + t < 4) {
      c[i] -= 3;
      rec(i, m + 1, t, h);
      c[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && c[i] && c[i + 1] && c[i + 2] && m + t < 4) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      rec(i, m + 1, t, h);
      c[i]++;
      c[i + 1]++;
      c[i + 2]++;
    }
    if (c[i] >= 2 && !h) {
      c[i] -= 2;
      rec(i, m, t, true);
      c[i] += 2;
    }
    if (c[i] >= 2 && m + t < 4) {
      c[i] -= 2;
      rec(i, m, t + 1, h);
      c[i] += 2;
    }
    if (i < 27 && i % 9 <= 7 && c[i] && c[i + 1] && m + t < 4) {
      c[i]--;
      c[i + 1]--;
      rec(i, m, t + 1, h);
      c[i]++;
      c[i + 1]++;
    }
    if (i < 27 && i % 9 <= 6 && c[i] && c[i + 2] && m + t < 4) {
      c[i]--;
      c[i + 2]--;
      rec(i, m, t + 1, h);
      c[i]++;
      c[i + 2]++;
    }
    c[i]--;
    rec(i, m, t, h);
    c[i]++;
  }
  rec(0, 0, 0, false);
  return best;
}
function shantenChiitoi(c: number[]): number {
  let p = 0,
    k = 0;
  for (let i = 0; i < 34; i++)
    if (c[i] > 0) {
      k++;
      if (c[i] >= 2) p++;
    }
  return 6 - p + Math.max(0, 7 - k);
}
function shantenKokushi(c: number[]): number {
  const T = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  let k = 0,
    p = 0;
  for (const t of T)
    if (c[t] > 0) {
      k++;
      if (c[t] >= 2) p = 1;
    }
  return 13 - k - p;
}
function shanten(c: number[]): number {
  return Math.min(shantenNormal(c), shantenChiitoi(c), shantenKokushi(c));
}
function ukeire(c: number[]): { base: number; total: number; tiles: number[] } {
  const base = shanten(c);
  const tiles: number[] = [];
  let total = 0;
  for (let t = 0; t < 34; t++) {
    if (c[t] >= 4) continue;
    c[t]++;
    if (shanten(c) < base) {
      tiles.push(t);
      total += 4 - (c[t] - 1);
    }
    c[t]--;
  }
  return { base, total, tiles };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "mahjong-nanikiru", version: "0.4.0" });
  const resourceUri = "ui://mahjong-nanikiru/hand.html";

  registerAppTool(
    server,
    "show_mahjong_hand",
    {
      title: "麻雀の手牌を表示（何切る）",
      description:
        "麻雀の手牌を牌コード配列で受け取り、牌画像で表示しシャンテン数・受け入れ・推奨打牌を返す。" +
        "牌コード: 1m〜9m(萬子) / 1p〜9p(筒子) / 1s〜9s(索子) / ton,nan,sha,pei(東南西北) / haku,hatsu,chun(白發中)。" +
        "あいまいな手牌表現(例: イーピン=1p, リャンピン=2p, チュン=中, ハツ=發, 3万=3m)はこの配列に変換して渡すこと。13枚か14枚。",
      inputSchema: {
        tiles: z
          .array(z.string())
          .describe(
            "牌コードの配列。例: ['1p','2p','3p','3m','4m','5m','chun','chun','hatsu','hatsu','ton','nan','sha']"
          ),
      },
      _meta: { ui: { resourceUri } },
    },
    async ({ tiles }): Promise<CallToolResult> => {
      const counts = new Array(34).fill(0);
      const handIdx: number[] = [];
      const unknown: string[] = [];
      for (const code of tiles) {
        const idx = codeToIndex(code);
        if (idx === null) {
          unknown.push(code);
          continue;
        }
        counts[idx]++;
        handIdx.push(idx);
      }
      handIdx.sort((a, b) => a - b);
      const total = handIdx.length;
      const sh = shanten(counts);

      // 14枚なら何切る（各打牌後のシャンテン/受け入れ）、13枚なら受け入れ
      let mode: "discard" | "improve" | "complete" | "invalid" = "improve";
      let recommend: { index: number; name: string; shanten: number; ukeire: number }[] = [];

      if (total !== 13 && total !== 14) {
        mode = "invalid";
      } else if (sh === -1) {
        mode = "complete";
      } else if (total === 14) {
        mode = "discard";
        const res: { index: number; name: string; shanten: number; ukeire: number }[] = [];
        for (let t = 0; t < 34; t++) {
          if (counts[t] === 0) continue;
          counts[t]--;
          const s2 = shanten(counts);
          const uk = ukeire(counts);
          counts[t]++;
          res.push({ index: t, name: NAMES[t], shanten: s2, ukeire: uk.total });
        }
        res.sort((a, b) => a.shanten - b.shanten || b.ukeire - a.ukeire);
        const bestSh = res[0].shanten;
        recommend = res.filter((r) => r.shanten === bestSh);
      } else {
        mode = "improve";
        const uk = ukeire(counts);
        recommend = uk.tiles.map((t) => ({
          index: t,
          name: NAMES[t],
          shanten: sh - 1,
          ukeire: 4 - counts[t],
        }));
      }

      const structuredContent = {
        tiles: handIdx,
        names: handIdx.map((i) => NAMES[i]),
        count: total,
        shanten: sh,
        mode,
        recommend,
        unknown,
      };

      // テキストfallback
      let text: string;
      if (mode === "invalid") text = `手牌が${total}枚です（13枚か14枚にしてください）。`;
      else if (mode === "complete")
        text = `和了形です（シャンテン -1）。手牌: ${structuredContent.names.join(" ")}`;
      else if (mode === "discard")
        text = `シャンテン:${sh} 推奨打牌: ${recommend.map((r) => `${r.name}(受${r.ukeire})`).join(" / ")}`;
      else text = `シャンテン:${sh} 受け入れ: ${recommend.map((r) => r.name).join(" ")}`;

      return {
        content: [{ type: "text", text }],
        structuredContent,
        ...(mode === "invalid" ? { isError: true } : {}),
      };
    }
  );

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(ROOT, "dist", "hand.html"), "utf-8");
      return { contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
    }
  );

  return server;
}
