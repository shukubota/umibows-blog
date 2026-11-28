import Link from "next/link";
import { ARTICLES, BASICS, GENERA, LEVEL_LABEL, LEVEL_ORDER } from "@/lib/clouds";
import type { CloudArticle, CloudGenus, CloudSection } from "@/lib/clouds";
import CloudSimSection from "./CloudSimSection";
import { Equation, RichText } from "./Tex";

const LEVEL_COLOR: Record<CloudGenus["level"], string> = {
  high: "#93c5fd",
  middle: "#a7f3d0",
  low: "#fcd34d",
  vertical: "#f9a8d4",
};

function Section({ section }: { section: CloudSection }) {
  return (
    <section className="space-y-2">
      <h4 className="text-base font-semibold text-white">
        <RichText text={section.heading} />
      </h4>
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

/** 高さ方向に10種の雲を並べた図 */
function AltitudeChart() {
  const W = 720;
  const H = 360;
  const top = 14; // km
  const left = 48;
  const y = (km: number) => H - 24 - (km / top) * (H - 40);
  const colW = (W - left - 10) / GENERA.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="雲の高さ">
      {[0, 2, 5, 7, 13].map((km) => (
        <g key={km}>
          <line x1={left} x2={W - 6} y1={y(km)} y2={y(km)} stroke="rgba(255,255,255,0.12)" />
          <text x={left - 8} y={y(km) + 4} textAnchor="end" fontSize="11" fill="#9ca3af">
            {km} km
          </text>
        </g>
      ))}
      {GENERA.map((g, i) => {
        const x = left + i * colW + colW / 2;
        const [lo, hi] = g.altitudeKm;
        return (
          <a key={g.id} href={`#${g.id}`}>
            <rect
              x={x - colW * 0.32}
              y={y(hi)}
              width={colW * 0.64}
              height={y(lo) - y(hi)}
              rx={8}
              fill={LEVEL_COLOR[g.level]}
              fillOpacity={0.28}
              stroke={LEVEL_COLOR[g.level]}
            />
            <text x={x} y={y(hi) - 6} textAnchor="middle" fontSize="12" fill="#e5e7eb">
              {g.abbr}
            </text>
            <text x={x} y={H - 6} textAnchor="middle" fontSize="11" fill="#d1d5db">
              {g.nameJa}
            </text>
          </a>
        );
      })}
    </svg>
  );
}

function CloudCard({ genus, article }: { genus: CloudGenus; article?: CloudArticle }) {
  return (
    <article
      id={genus.id}
      className="scroll-mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-2xl font-bold text-white">{genus.nameJa}</h3>
        <span className="font-mono text-sm" style={{ color: LEVEL_COLOR[genus.level] }}>
          {genus.latin}（{genus.abbr}）
        </span>
        <span className="text-sm text-gray-400">{genus.nicknames.join("・")}</span>
        <span className="text-xs text-gray-500 ml-auto">
          高さ およそ {genus.altitudeKm[0]}〜{genus.altitudeKm[1]} km
        </span>
      </header>
      {article ? (
        <>
          <p className="text-gray-200 leading-7">
            <RichText text={article.summary} />
          </p>
          {article.identify.length > 0 && (
            <div className="rounded-lg bg-black/20 px-4 py-3">
              <div className="text-xs font-semibold text-gray-400 mb-1">見分け方</div>
              <ul className="list-disc pl-5 text-sm text-gray-300 space-y-1">
                {article.identify.map((t, i) => (
                  <li key={i}>
                    <RichText text={t} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <CloudSimSection id={genus.id} />
          {article.sections.map((s, i) => (
            <Section key={i} section={s} />
          ))}
        </>
      ) : (
        <p className="text-sm text-gray-500">執筆中です。</p>
      )}
    </article>
  );
}

export default function CloudsPage() {
  const byId = new Map(ARTICLES.map((a) => [a.id, a]));
  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-sky-300 to-pink-300 bg-clip-text text-transparent">
            十種雲形 — 10種類の雲と、そのでき方の数式
          </h1>
          <p className="text-gray-400 text-sm">
            雲は高さと形で10種類に分けられます（WMO
            の国際分類）。どの雲も「空気が冷えて水蒸気が凝結する」ことで生まれますが、
            何が空気を冷やすか（上昇の速さ・広さ、放射、混合）で姿が変わります。それぞれの雲を数式で説明します。
          </p>
          <p className="text-sm">
            <Link href="/atmospheric-waves" className="text-sky-300 hover:underline">
              山岳波で筋雲が並ぶシミュレーション（大気の波）→
            </Link>
            <span className="text-gray-600">　</span>
            <Link href="/baroclinic" className="text-sky-300 hover:underline">
              低気圧と前線の雲の帯が育つシミュレーション（傾圧不安定）→
            </Link>
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-lg font-semibold mb-2">雲の高さ</h2>
          <AltitudeChart />
          <nav className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-3 text-sm">
            {LEVEL_ORDER.map((lv) => (
              <div key={lv}>
                <span className="text-gray-400">{LEVEL_LABEL[lv]}：</span>
                {GENERA.filter((g) => g.level === lv).map((g, i) => (
                  <span key={g.id}>
                    {i > 0 && "・"}
                    <a href={`#${g.id}`} className="text-sky-300 hover:underline">
                      {g.nameJa}
                    </a>
                  </span>
                ))}
              </div>
            ))}
          </nav>
        </section>

        <section id="basics" className="space-y-4">
          <h2 className="text-2xl font-bold">雲ができるしくみ</h2>
          {BASICS.length > 0 ? (
            BASICS.map((s, i) => <Section key={i} section={s} />)
          ) : (
            <p className="text-sm text-gray-500">執筆中です。</p>
          )}
        </section>

        {LEVEL_ORDER.map((lv) => (
          <section key={lv} className="space-y-4">
            <h2 className="text-2xl font-bold">{LEVEL_LABEL[lv]}</h2>
            {GENERA.filter((g) => g.level === lv).map((g) => (
              <CloudCard key={g.id} genus={g} article={byId.get(g.id)} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
