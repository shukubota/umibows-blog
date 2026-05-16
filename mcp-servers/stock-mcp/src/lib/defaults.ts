export const DEFAULT_MARKET_SYMBOLS: Record<string, string> = {
  sp500: "SPY",
  nasdaq: "QQQ",
  dow: "DIA",
  vix: "^VIX",
  usdJpy: "USDJPY=X",
  treasury10y: "^TNX",
  treasury2y: "^IRX",
};

export const DEFAULT_SECTOR_ETFS: { ticker: string; name: string }[] = [
  { ticker: "XLK", name: "Information Technology" },
  { ticker: "XLF", name: "Financials" },
  { ticker: "XLV", name: "Health Care" },
  { ticker: "XLE", name: "Energy" },
  { ticker: "XLI", name: "Industrials" },
  { ticker: "XLY", name: "Consumer Discretionary" },
  { ticker: "XLP", name: "Consumer Staples" },
  { ticker: "XLB", name: "Materials" },
  { ticker: "XLU", name: "Utilities" },
  { ticker: "XLRE", name: "Real Estate" },
  { ticker: "XLC", name: "Communication Services" },
];
