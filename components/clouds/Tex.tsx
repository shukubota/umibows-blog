import katex from "katex";
import { splitInlineMath } from "@/lib/clouds/text";
import type { MathBlock } from "@/lib/clouds/types";

// 数式はすべてこのリポジトリ内の固定文字列なので、サーバー側で KaTeX の HTML にして埋め込む。
function renderTex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false });
}

/** $...$ をインライン数式として描画する文 */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {splitInlineMath(text).map((part, i) =>
        part.kind === "math" ? (
          <span key={i} dangerouslySetInnerHTML={{ __html: renderTex(part.value, false) }} />
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </>
  );
}

export function Equation({ block }: { block: MathBlock }) {
  return (
    <figure className="my-3 rounded-lg border border-white/10 bg-black/30 px-4 py-2">
      <div
        className="overflow-x-auto text-sky-100"
        dangerouslySetInnerHTML={{ __html: renderTex(block.tex, true) }}
      />
      {block.caption && (
        <figcaption className="text-xs text-gray-400 pb-1">
          <RichText text={block.caption} />
        </figcaption>
      )}
    </figure>
  );
}
