import type { Metadata } from "next";
import {
  fetchMarketOverview,
  fetchSectorData,
  fetchWatchlistDetail,
  fetchEarningsCalendar,
} from "./lib/fetcher";
import { computeIndicators } from "./lib/indicators";
import { WATCHLIST, SECTOR_ETFS, MARKET_SYMBOLS } from "./config";
import MarketBar from "./components/MarketBar";
import SectorHeatmap from "./components/SectorHeatmap";
import WatchList from "./components/WatchList";
import MarketCondition from "./components/MarketCondition";
import EarningsCalendar from "./components/EarningsCalendar";

export const metadata: Metadata = {
  title: "米国株ダッシュボード | Umibows Blog",
  description: "米国株市場の現状分析ダッシュボード",
};

export const revalidate = 300; // 5分キャッシュ

export default async function StockDashboardPage() {
  const [market, sectors, watchlist, earnings] = await Promise.all([
    fetchMarketOverview(MARKET_SYMBOLS),
    fetchSectorData(SECTOR_ETFS.map((e) => e.ticker)),
    fetchWatchlistDetail(WATCHLIST.map((w) => w.ticker)),
    fetchEarningsCalendar(WATCHLIST.map((w) => w.ticker)),
  ]);

  const sp500 = market.sp500;
  const sp500Stock = watchlist.find((s) => s.symbol === "VOO");
  const sp500AboveMA200 = sp500Stock
    ? sp500Stock.aboveMA200
    : sp500 && !isNaN(sp500.price)
      ? true
      : false;

  const vixPrice = market.vix?.price ?? 20;
  const treasury10y = market.treasury10y?.price ?? NaN;
  const treasury2y = market.treasury2y?.price ?? NaN;

  const now = new Date();
  const timeStr = now.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">米国株ダッシュボード</h1>
          <div className="text-gray-500 text-xs">更新: {timeStr} JST（最大15分遅延）</div>
        </div>

        {/* [1] 市場概況バー */}
        <MarketBar
          sp500={market.sp500}
          nasdaq={market.nasdaq}
          dow={market.dow}
          vix={market.vix}
          usdJpy={market.usdJpy}
        />

        {/* [2][4] セクター + 地合い */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <SectorHeatmap sectors={sectors} />
          </div>
          <div>
            <MarketCondition
              sp500AboveMA200={sp500AboveMA200}
              vix={vixPrice}
              treasury10y={treasury10y}
              treasury2y={treasury2y}
            />
          </div>
        </div>

        {/* [3] ウォッチリスト */}
        <WatchList stocks={watchlist} />

        {/* [5] 決算カレンダー */}
        <EarningsCalendar events={earnings} />

        <p className="text-center text-gray-600 text-xs pb-4">
          投資判断は自己責任で。このダッシュボードは情報提供のみを目的としています。
        </p>
      </div>
    </main>
  );
}
