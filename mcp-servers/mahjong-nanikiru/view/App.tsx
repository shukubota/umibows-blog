/**
 * 何切る View 本体（React）。
 *
 * - use(handPromise) で最初の手牌を待つ（ローディングは hand.tsx の <Suspense> が担当）
 * - subscribe() でホストのツール再実行にも追従
 * - 段階描画: 手牌を左から1枚ずつ出し、出し切ってから推奨打牌をフェードインさせる
 *
 * ※ ツール結果は ontoolresult で「一括」到達するため、これは真の server stream ではなく
 *   受信後のクライアント側の段階的な描画演出。
 */
import { use, useEffect, useState } from "react";
import { handPromise, isConnected, requestHand, subscribe } from "./mcp";
import type { Hand, Reco } from "./model";
import { TILE_SVGS } from "./tiles";

// index 0-33 の牌名（server.ts の NAMES と同順）。字牌は漢字（codeToIndex が受け付ける）。
const ALL_NAMES = [
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

/** 手牌からランダムに1枚捨て、山からランダムに1枚（同種4枚まで）ツモった牌名配列を返す。 */
function randomSwap(names: string[]): { next: string[]; discarded: string; drawn: string } {
  const next = names.slice();
  const di = Math.floor(Math.random() * next.length);
  const discarded = next[di];
  next.splice(di, 1);
  let drawn = "";
  for (let guard = 0; guard < 200; guard++) {
    const cand = ALL_NAMES[Math.floor(Math.random() * ALL_NAMES.length)];
    if (next.filter((x) => x === cand).length < 4) {
      drawn = cand;
      break;
    }
  }
  next.push(drawn);
  return { next, discarded, drawn };
}

function Tile({ index, shown }: { index: number; shown: boolean }) {
  return (
    <span
      className={`t${shown ? " show" : ""}`}
      dangerouslySetInnerHTML={{ __html: TILE_SVGS[index] ?? "" }}
    />
  );
}

function RecoTile({ reco, label }: { reco: Reco; label: string }) {
  return (
    <div className="reco">
      <span className="rt" dangerouslySetInnerHTML={{ __html: TILE_SVGS[reco.index] ?? "" }} />
      <div className="u">{label}</div>
    </div>
  );
}

function Result({ hand }: { hand: Hand }) {
  // 手牌を左から順に見せ、出し切ってから推奨打牌を出す
  const [revealed, setRevealed] = useState(0);
  const [showReco, setShowReco] = useState(false);

  useEffect(() => {
    setRevealed(0);
    setShowReco(false);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= hand.tiles.length) {
        window.clearInterval(id);
        window.setTimeout(() => setShowReco(true), 220);
      }
    }, 55);
    return () => window.clearInterval(id);
  }, [hand]);

  const meta =
    hand.mode === "complete"
      ? "和了形です 🎉"
      : hand.mode === "discard"
        ? `シャンテン: ${hand.shanten}（何切る＝打牌候補）`
        : `シャンテン: ${hand.shanten}`;

  const recoLabel = hand.mode === "discard" ? "推奨打牌（受け入れ最大）" : "受け入れ牌";

  return (
    <>
      <div className="label">手牌（{hand.count}枚）</div>
      <div className="hand">
        {hand.tiles.map((t, idx) => (
          <Tile key={`${idx}-${t}`} index={t} shown={idx < revealed} />
        ))}
      </div>
      <div className="meta">{meta}</div>
      {hand.mode !== "complete" && (
        <div className={`reco-wrap${showReco ? " show" : ""}`}>
          <div className="label">{recoLabel}</div>
          <div className="recos">
            {hand.recommend.map((r) => (
              <RecoTile
                key={r.index}
                reco={r}
                label={hand.mode === "discard" ? `受 ${r.ukeire} 枚` : `${r.ukeire} 枚`}
              />
            ))}
          </div>
        </div>
      )}
      {hand.unknown.length > 0 && (
        <div className="warn">未認識のコード: {hand.unknown.join(", ")}</div>
      )}
    </>
  );
}

function Invalid({ hand }: { hand: Hand }) {
  return (
    <>
      <div className="warn">手牌が{hand.count}枚です。13枚か14枚で指定してください。</div>
      <div className="hand">
        {hand.tiles.map((t, idx) => (
          <Tile key={`${idx}-${t}`} index={t} shown />
        ))}
      </div>
    </>
  );
}

export function App() {
  const first = use(handPromise);
  const [hand, setHand] = useState<Hand>(first);
  const [busy, setBusy] = useState(false);
  const [swaps, setSwaps] = useState(0);
  const [last, setLast] = useState<{ discarded: string; drawn: string } | null>(null);
  useEffect(() => subscribe(setHand), []);

  async function swap() {
    if (busy) return;
    setBusy(true);
    const { next, discarded, drawn } = randomSwap(hand.names);
    setLast({ discarded, drawn });
    try {
      if (isConnected()) {
        const h = await requestHand(next);
        if (h) setHand(h);
      }
    } catch (e) {
      console.error("swap failed", e);
    } finally {
      setSwaps((n) => n + 1);
      setBusy(false);
    }
  }

  function reset() {
    setHand(first);
    setSwaps(0);
    setLast(null);
  }

  return (
    <>
      {hand.mode === "invalid" ? <Invalid hand={hand} /> : <Result hand={hand} />}
      <div className="controls">
        <button className="swap" onClick={swap} disabled={busy}>
          {busy ? "計算中…" : "🎲 1牌交換"}
        </button>
        <button className="reset" onClick={reset} disabled={busy}>
          リセット
        </button>
        {last && (
          <span className="swaplog">
            <span className="down">−{last.discarded}</span>
            <span className="up">＋{last.drawn}</span>
            <span className="cnt">（交換 {swaps} 回）</span>
          </span>
        )}
      </div>
    </>
  );
}
