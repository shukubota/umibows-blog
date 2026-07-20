/**
 * 何切る View 本体（React）— ツモ／打牌インタラクション版。
 *
 * - use(handPromise) で最初の手牌（13枚）を待つ
 * - subscribe() でホストのツール再実行にも追従（LLMが手牌を差し替えたら全リセット）
 * - 「山からツモる」で山(wall)から1枚引いて14枚に → 捨てる牌をクリックして13枚に戻す
 * - 山(wall)・河(discards) を View 側で管理し、打牌のたびに callServerTool で
 *   サーバーにシャンテン/受け入れを再計算させる（requestHand）。
 */
import { use, useEffect, useState } from "react";
import { handPromise, isConnected, requestHand, subscribe } from "./mcp";
import type { Hand } from "./model";
import { TILE_NAMES, TILE_SVGS } from "./tiles";

/** 全牌（各4枚=136枚）から exclude を除いた山を作る。 */
function buildWall(exclude: number[]): number[] {
  const counts = new Array(34).fill(4);
  for (const t of exclude) if (counts[t] > 0) counts[t]--;
  const wall: number[] = [];
  for (let t = 0; t < 34; t++) for (let k = 0; k < counts[t]; k++) wall.push(t);
  return wall;
}
const sortIdx = (a: number[]) => a.slice().sort((x, y) => x - y);

function Tile({
  index,
  className,
  onClick,
}: {
  index: number;
  className: string;
  onClick?: () => void;
}) {
  return (
    <span
      className={className}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: TILE_SVGS[index] ?? "" }}
    />
  );
}

function splitFirst(h: Hand): { base: number[]; drawn: number | null } {
  if (h.tiles.length >= 14) {
    const b = h.tiles.slice();
    const drawn = b.pop() as number;
    return { base: sortIdx(b), drawn };
  }
  return { base: sortIdx(h.tiles), drawn: null };
}

export function App() {
  const first = use(handPromise);
  const init = splitFirst(first);

  const [base, setBase] = useState<number[]>(init.base);
  const [drawn, setDrawn] = useState<number | null>(init.drawn);
  const [wall, setWall] = useState<number[]>(() => buildWall(first.tiles));
  const [discards, setDiscards] = useState<number[]>([]);
  const [analysis, setAnalysis] = useState<Hand>(first);
  const [busy, setBusy] = useState(false);

  const phase: "draw" | "discard" = drawn === null ? "draw" : "discard";

  // ホストがツールを再実行（LLMが別の手牌を出した）ら、全状態をその手牌でリセット
  useEffect(
    () =>
      subscribe((h) => {
        const s = splitFirst(h);
        setBase(s.base);
        setDrawn(s.drawn);
        setWall(buildWall(h.tiles));
        setDiscards([]);
        setAnalysis(h);
      }),
    []
  );

  async function analyze(tiles: number[]) {
    if (!isConnected()) return;
    try {
      const h = await requestHand(tiles.map((i) => TILE_NAMES[i]));
      if (h) setAnalysis(h);
    } catch (e) {
      console.error("analyze failed", e);
    }
  }

  async function draw() {
    if (busy || phase !== "draw" || wall.length === 0) return;
    setBusy(true);
    const i = Math.floor(Math.random() * wall.length);
    const t = wall[i];
    const nw = wall.slice();
    nw.splice(i, 1);
    setWall(nw);
    setDrawn(t);
    await analyze([...base, t]); // 14枚で何切る解析（推奨打牌が出る）
    setBusy(false);
  }

  async function discard(tile: number, fromDrawn: boolean) {
    if (busy || phase !== "discard" || drawn === null) return;
    setBusy(true);
    let next: number[];
    if (fromDrawn) {
      next = base.slice(); // ツモ切り：手牌はそのまま
    } else {
      next = base.slice();
      next.splice(next.indexOf(tile), 1); // 手牌から1枚外し
      next.push(drawn); // ツモ牌が手に入る
    }
    next = sortIdx(next);
    setBase(next);
    setDiscards((d) => [...d, tile]);
    setDrawn(null);
    await analyze(next); // 13枚で受け入れ解析
    setBusy(false);
  }

  function reset() {
    setBase(init.base);
    setDrawn(init.drawn);
    setWall(buildWall(first.tiles));
    setDiscards([]);
    setAnalysis(first);
  }

  const sh = analysis.shanten;
  const won = analysis.mode === "complete";
  const meta = won
    ? "🎉 和了形！（ツモ和了）"
    : phase === "draw"
      ? `シャンテン ${sh}　—　山からツモってください`
      : `シャンテン ${sh}（14枚）　—　捨てる牌をクリック`;

  const hintLabel = phase === "draw" ? "受け入れ牌（引くと進む）" : "推奨打牌（受け入れ最大）";
  const showHints = !busy && !won && analysis.recommend.length > 0;

  return (
    <>
      <div className="label">手牌（{base.length + (drawn !== null ? 1 : 0)}枚）</div>
      <div className={`hand${phase === "discard" ? " discardable" : ""}`}>
        {base.map((t, i) => (
          <Tile
            key={`b${i}-${t}`}
            index={t}
            className={`t show${phase === "discard" ? " clickable" : ""}`}
            onClick={phase === "discard" ? () => discard(t, false) : undefined}
          />
        ))}
        {drawn !== null && <span className="gap" />}
        {drawn !== null && (
          <Tile
            index={drawn}
            className="t show drawn clickable"
            onClick={() => discard(drawn, true)}
          />
        )}
      </div>

      <div className="meta">{meta}</div>

      <div className="controls">
        <button
          className="draw"
          disabled={busy || phase !== "draw" || wall.length === 0}
          onClick={draw}
        >
          {wall.length === 0 ? "山なし（流局）" : busy && phase === "draw" ? "…" : "ツモ"}
        </button>
        <button className="reset" disabled={busy} onClick={reset}>
          リセット
        </button>
        <span className="wallinfo">
          山 残り <b>{wall.length}</b> 枚 ・ 河 {discards.length} 枚
        </span>
      </div>

      {showHints && (
        <div className="reco-wrap show">
          <div className="label">{hintLabel}</div>
          <div className="recos">
            {analysis.recommend.map((r) => (
              <div className="reco" key={r.index}>
                <span
                  className="rt"
                  dangerouslySetInnerHTML={{ __html: TILE_SVGS[r.index] ?? "" }}
                />
                <div className="u">{phase === "draw" ? `${r.ukeire}枚` : `受 ${r.ukeire}`}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {discards.length > 0 && (
        <>
          <div className="label">河（捨て牌）</div>
          <div className="river">
            {discards.map((t, i) => (
              <Tile key={`d${i}-${t}`} index={t} className="dt" />
            ))}
          </div>
        </>
      )}

      {analysis.unknown.length > 0 && (
        <div className="warn">未認識のコード: {analysis.unknown.join(", ")}</div>
      )}
    </>
  );
}
