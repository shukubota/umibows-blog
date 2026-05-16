import type { StockIndicators } from "./indicators.js";

export type MarketSignal = "strong" | "overbought" | "oversold" | "downtrend" | "neutral";

export function getStockSignal(ind: StockIndicators): MarketSignal {
  if (!ind.aboveMA200) return "downtrend";
  if (ind.rsi >= 70) return "overbought";
  if (ind.rsi <= 35) return "oversold";
  if (ind.ma5AboveMA25 && ind.rsi >= 40 && ind.rsi <= 60) return "strong";
  return "neutral";
}

export const SIGNAL_LABEL: Record<MarketSignal, string> = {
  strong: "強気候補",
  overbought: "過買い注意",
  oversold: "過売り注目",
  downtrend: "トレンド外",
  neutral: "中立",
};

export type MarketMode = "bullish" | "defensive" | "warning";

export function getMarketMode(sp500AboveMA200: boolean, vix: number): MarketMode {
  if (vix > 30) return "warning";
  if (!sp500AboveMA200) return "defensive";
  return "bullish";
}

export const MODE_META: Record<MarketMode, { label: string; description: string }> = {
  bullish: {
    label: "強気モード",
    description: "通常運用 — すべてのシグナルが有効",
  },
  defensive: {
    label: "守りモード",
    description: "S&P500 が200日MA割れ — 新規エントリー非推奨",
  },
  warning: {
    label: "警戒モード",
    description: "VIX 急騰中 — 強いシグナルのみ対応",
  },
};
