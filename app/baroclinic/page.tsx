import "katex/dist/katex.min.css";
import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import BaroclinicSim from "../../components/BaroclinicSim";
import { Equation, RichText } from "../../components/clouds/Tex";
import { satelliteSections, theorySections } from "../../lib/baroclinic-content";
import type { CloudSection } from "../../lib/clouds/types";

export const metadata: Metadata = {
  title: "傾圧不安定 — 衛星画像の雲の帯を方程式から | Umibows Blog",
  description:
    "南北の温度差から温帯低気圧と前線の雲の帯が生まれるしくみを、2層準地衡流モデルで解いて疑似的なひまわり赤外画像として描く。",
};

function Section({ section }: { section: CloudSection }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">
        <RichText text={section.heading} />
      </h2>
      {section.paragraphs.map((p, i) => (
        <p key={i} className="text-sm leading-7 text-gray-300">
          <RichText text={p} />
        </p>
      ))}
      {section.equations?.map((eq, i) => (
        <Equation key={i} block={eq} />
      ))}
      {section.after?.map((p, i) => (
        <p key={i} className="text-sm leading-7 text-gray-300">
          <RichText text={p} />
        </p>
      ))}
    </section>
  );
}

export default function BaroclinicPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white font-sans">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-sky-300 to-pink-300 bg-clip-text text-transparent">
            傾圧不安定 — 衛星画像の雲の帯を方程式から
          </h1>
          <p className="text-gray-400 text-sm max-w-4xl">
            南北の温度差だけを与えた中緯度の大気で、小さな揺らぎから温帯低気圧の列が育ち、
            暖気が昇る所に前線の雲の帯、寒気が流れ出す所に低い雲が広がる様子を、
            2層準地衡流モデルで計算して疑似的な赤外画像として描きます。
          </p>
          <p className="text-sm flex flex-wrap gap-x-4 gap-y-1">
            <a
              href="https://www.jma.go.jp/bosai/map.html#5/35/135/&elem=ir&contents=himawari"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-300 hover:underline"
            >
              本物のひまわり赤外画像（気象庁）↗
            </a>
            <Link href="/clouds" className="text-sky-300 hover:underline">
              十種雲形 →
            </Link>
            <Link href="/atmospheric-waves" className="text-sky-300 hover:underline">
              大気の波（慣性波・重力波・筋雲）→
            </Link>
          </p>
        </header>

        <BaroclinicSim />

        <div className="max-w-4xl space-y-10">
          {[...satelliteSections, ...theorySections].map((s, i) => (
            <Section key={i} section={s} />
          ))}
        </div>
      </div>
    </main>
  );
}
