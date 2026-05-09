import type { StockIndicators } from "./indicators";

export type MarketSignal = "strong" | "overbought" | "oversold" | "downtrend" | "neutral";

export function getStockSignal(ind: StockIndicators): MarketSignal {
  if (!ind.aboveMA200) return "downtrend";
  if (ind.rsi >= 70) return "overbought";
  if (ind.rsi <= 35) return "oversold";
  if (ind.ma5AboveMA25 && ind.rsi >= 40 && ind.rsi <= 60) return "strong";
  return "neutral";
}

export type MarketMode = "bullish" | "defensive" | "warning";

export function getMarketMode(sp500AboveMA200: boolean, vix: number): MarketMode {
  if (vix > 30) return "warning";
  if (!sp500AboveMA200) return "defensive";
  return "bullish";
}

export const SIGNAL_META: Record<MarketSignal, { label: string; bg: string; text: string }> = {
  strong: { label: "強気候補", bg: "bg-green-900/50", text: "text-green-400" },
  overbought: { label: "過買い注意", bg: "bg-red-900/50", text: "text-red-400" },
  oversold: { label: "過売り注目", bg: "bg-yellow-900/50", text: "text-yellow-400" },
  downtrend: { label: "トレンド外", bg: "bg-gray-800", text: "text-gray-500" },
  neutral: { label: "中立", bg: "bg-gray-800", text: "text-gray-400" },
};

export const MODE_META: Record<MarketMode, { label: string; desc: string; border: string }> = {
  bullish: {
    label: "強気モード",
    desc: "通常運用 — すべてのシグナルが有効",
    border: "border-green-500",
  },
  defensive: {
    label: "守りモード",
    desc: "S&P500 が200日MA割れ — 新規エントリー非推奨",
    border: "border-yellow-500",
  },
  warning: {
    label: "警戒モード",
    desc: "VIX 急騰中 — 強いシグナルのみ対応",
    border: "border-red-500",
  },
};
