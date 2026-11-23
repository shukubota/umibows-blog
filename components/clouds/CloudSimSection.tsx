import type { CloudId } from "@/lib/clouds/types";
import { getSim } from "@/lib/cloud-sim";
import CloudSimPlayer from "./CloudSimPlayer";
import { Equation, RichText } from "./Tex";

/** 雲のカードの中に置く「でき方のシミュレーション」。数式はサーバー側で描画する。 */
export default function CloudSimSection({ id }: { id: CloudId }) {
  const sim = getSim(id);
  if (!sim) return null;
  return (
    <section className="space-y-3 rounded-xl border border-sky-400/20 bg-sky-950/20 p-4">
      <h4 className="text-base font-semibold text-sky-200">
        シミュレーション：
        <RichText text={sim.title} />
      </h4>
      {sim.description.map((p, i) => (
        <p key={i} className="text-sm leading-7 text-gray-300">
          <RichText text={p} />
        </p>
      ))}
      <CloudSimPlayer id={id} />
      <details className="group">
        <summary className="cursor-pointer text-sm text-sky-300 hover:underline">
          解いている方程式
        </summary>
        {sim.equations.map((eq, i) => (
          <Equation key={i} block={eq} />
        ))}
      </details>
    </section>
  );
}
