import type { EarningsEvent } from "../lib/fetcher";

type Props = { events: EarningsEvent[] };

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function EarningsCalendar({ events }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <h2 className="text-gray-300 text-sm font-semibold mb-3">決算カレンダー（今後）</h2>
      {events.length === 0 ? (
        <p className="text-gray-500 text-sm">取得できませんでした</p>
      ) : (
        <div className="space-y-2">
          {events.map((e) => {
            const d = new Date(e.date);
            const dateStr = `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]})`;
            return (
              <div key={e.symbol} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-b-0">
                <div>
                  <span className="text-white font-semibold text-sm">{e.symbol}</span>
                  <span className="text-gray-500 text-xs ml-2">{e.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-gray-300 text-sm font-mono">{dateStr}</div>
                  {e.epsEstimate !== null && (
                    <div className="text-gray-500 text-xs">予想EPS: ${e.epsEstimate.toFixed(2)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
