import type { QuoteData } from "../lib/fetcher";
import { SECTOR_ETFS } from "../config";

type Props = { sectors: QuoteData[] };

function cellColor(pct: number) {
  if (pct >= 2) return "bg-green-700 text-green-100";
  if (pct >= 1) return "bg-green-900 text-green-300";
  if (pct >= 0) return "bg-gray-700 text-gray-200";
  if (pct >= -1) return "bg-red-900 text-red-300";
  return "bg-red-700 text-red-100";
}

export default function SectorHeatmap({ sectors }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <h2 className="text-gray-300 text-sm font-semibold mb-3">セクターヒートマップ</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {sectors.map((s) => {
          const meta = SECTOR_ETFS.find((e) => e.ticker === s.symbol);
          const pct = s.changePercent;
          return (
            <div key={s.symbol} className={`rounded p-2 text-center ${cellColor(pct)}`}>
              <div className="text-xs font-bold">{meta?.name ?? s.symbol}</div>
              <div className="text-xs font-mono mt-0.5">
                {pct >= 0 ? "+" : ""}
                {pct.toFixed(2)}%
              </div>
              <div className="text-xs opacity-60">{s.symbol}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
