"use client";

import { Fragment, useState } from "react";
import type { StockDetail } from "../lib/fetcher";
import { getStockSignal, SIGNAL_META } from "../lib/condition";
import StockChart from "./StockChart";

type Props = { stocks: StockDetail[] };

function fmt(n: number, digits = 2) {
  return isNaN(n) ? "—" : n.toFixed(digits);
}

function VolumeBadge({ volume, avgVolume }: { volume: number; avgVolume: number }) {
  if (!avgVolume || !volume) return null;
  const ratio = volume / avgVolume;
  if (ratio >= 1.5)
    return <span className="text-xs text-yellow-400 ml-1">出来高↑{ratio.toFixed(1)}x</span>;
  return null;
}

export default function WatchList({ stocks }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <h2 className="text-gray-300 text-sm font-semibold mb-3">ウォッチリスト</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-gray-800">
              <th className="text-left py-2 pr-4">銘柄</th>
              <th className="text-right pr-4">価格</th>
              <th className="text-right pr-4">前日比</th>
              <th className="text-right pr-4">200日MA比</th>
              <th className="text-right pr-4">RSI</th>
              <th className="text-right pr-4">MA5/25</th>
              <th className="text-right">判定</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s) => {
              const signal = getStockSignal(s);
              const meta = SIGNAL_META[signal];
              const ma200diff = isNaN(s.ma200) ? NaN : ((s.price - s.ma200) / s.ma200) * 100;
              const isOpen = selected === s.symbol;

              return (
                <Fragment key={s.symbol}>
                  <tr
                    className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
                    onClick={() => setSelected(isOpen ? null : s.symbol)}
                  >
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-white">{s.symbol}</div>
                      <div className="text-gray-500 text-xs">{s.name}</div>
                      <VolumeBadge volume={s.volume} avgVolume={s.avgVolume} />
                    </td>
                    <td className="text-right pr-4 font-mono text-white">${fmt(s.price)}</td>
                    <td
                      className={`text-right pr-4 font-mono ${s.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      {s.changePercent >= 0 ? "+" : ""}
                      {fmt(s.changePercent)}%
                    </td>
                    <td
                      className={`text-right pr-4 font-mono text-xs ${isNaN(ma200diff) ? "text-gray-500" : ma200diff >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      {isNaN(ma200diff)
                        ? "—"
                        : `${ma200diff >= 0 ? "+" : ""}${ma200diff.toFixed(1)}%`}
                    </td>
                    <td
                      className={`text-right pr-4 font-mono text-xs ${isNaN(s.rsi) ? "text-gray-500" : s.rsi >= 70 ? "text-red-400" : s.rsi <= 30 ? "text-green-400" : "text-gray-300"}`}
                    >
                      {fmt(s.rsi, 0)}
                    </td>
                    <td className="text-right pr-4">
                      {!isNaN(s.ma5) && !isNaN(s.ma25) && (
                        <span
                          className={
                            s.ma5AboveMA25 ? "text-green-400 text-xs" : "text-red-400 text-xs"
                          }
                        >
                          {s.ma5AboveMA25 ? "↑ 上抜け" : "↓ 下抜け"}
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${meta.bg} ${meta.text}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} className="pb-4 pt-2">
                        <StockChart
                          symbol={s.symbol}
                          prices={s.prices}
                          ma5={s.ma5}
                          ma25={s.ma25}
                          ma200={s.ma200}
                          rsi={s.rsi}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
