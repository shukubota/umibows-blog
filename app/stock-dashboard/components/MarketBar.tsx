import type { QuoteData } from "../lib/fetcher";

type Props = {
  sp500: QuoteData | null;
  nasdaq: QuoteData | null;
  dow: QuoteData | null;
  vix: QuoteData | null;
  usdJpy: QuoteData | null;
};

function Pct({ value }: { value: number }) {
  const pos = value >= 0;
  return (
    <span className={pos ? "text-green-400" : "text-red-400"}>
      {pos ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function VixBadge({ value }: { value: number }) {
  const color = value > 25 ? "bg-red-900 text-red-300" : value > 15 ? "bg-yellow-900 text-yellow-300" : "bg-green-900 text-green-300";
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${color}`}>{value.toFixed(1)}</span>;
}

function Item({ label, price, pct, extra }: { label: string; price: string; pct: number; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-r border-gray-700 last:border-r-0">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white font-mono font-semibold">{price}</span>
      {extra ?? <Pct value={pct} />}
    </div>
  );
}

export default function MarketBar({ sp500, nasdaq, dow, vix, usdJpy }: Props) {
  return (
    <div className="flex flex-wrap items-center bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
      {sp500 && <Item label="S&P500" price={sp500.price.toFixed(2)} pct={sp500.changePercent} />}
      {nasdaq && <Item label="NASDAQ" price={nasdaq.price.toFixed(2)} pct={nasdaq.changePercent} />}
      {dow && <Item label="DOW" price={dow.price.toFixed(2)} pct={dow.changePercent} />}
      {vix && (
        <Item
          label="VIX"
          price=""
          pct={0}
          extra={<VixBadge value={vix.price} />}
        />
      )}
      {usdJpy && (
        <Item label="USD/JPY" price={usdJpy.price.toFixed(2)} pct={usdJpy.changePercent} />
      )}
    </div>
  );
}
