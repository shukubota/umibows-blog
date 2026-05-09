import { getMarketMode, MODE_META } from "../lib/condition";

type Props = {
  sp500AboveMA200: boolean;
  vix: number;
  treasury10y: number;
  treasury2y: number;
};

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-b-0">
      <span className="text-gray-400 text-sm">{label}</span>
      <div className="text-right">
        <span className="text-white font-mono text-sm">{value}</span>
        {sub && <div className="text-xs text-gray-500">{sub}</div>}
      </div>
    </div>
  );
}

export default function MarketCondition({ sp500AboveMA200, vix, treasury10y, treasury2y }: Props) {
  const mode = getMarketMode(sp500AboveMA200, vix);
  const meta = MODE_META[mode];
  const spread = treasury10y - treasury2y;
  const spreadSign = spread >= 0 ? "+" : "";

  return (
    <div className={`bg-gray-900 border-2 ${meta.border} rounded-lg p-4`}>
      <h2 className="text-gray-300 text-sm font-semibold mb-3">地合いパネル</h2>

      <div className={`mb-4 p-3 rounded-lg border ${meta.border} bg-gray-800`}>
        <div className="text-white font-bold text-base">{meta.label}</div>
        <div className="text-gray-400 text-xs mt-1">{meta.desc}</div>
      </div>

      <Row
        label="S&P500 vs 200日MA"
        value={sp500AboveMA200 ? "● 上（強気）" : "○ 下（注意）"}
        sub={sp500AboveMA200 ? "上昇トレンド継続" : "下落トレンド — エントリー非推奨"}
      />
      <Row
        label="VIX"
        value={vix.toFixed(1)}
        sub={vix > 30 ? "警戒水準" : vix > 20 ? "やや緊張" : "落ち着いている"}
      />
      {!isNaN(spread) && (
        <Row
          label="イールドカーブ (10yr-2yr)"
          value={`${spreadSign}${spread.toFixed(2)}%`}
          sub={spread < 0 ? "逆イールド — 景気後退シグナル" : "正常"}
        />
      )}
    </div>
  );
}
