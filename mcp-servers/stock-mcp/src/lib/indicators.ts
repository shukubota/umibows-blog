export function calculateSMA(prices: number[], period: number): number[] {
  return prices.map((_, i) => {
    if (i < period - 1) return NaN;
    const slice = prices.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

export function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return NaN;
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const recent = changes.slice(-period);
  const gains = recent.filter((c) => c > 0).reduce((a, b) => a + b, 0) / period;
  const losses =
    recent
      .filter((c) => c < 0)
      .map(Math.abs)
      .reduce((a, b) => a + b, 0) / period;
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

export type StockIndicators = {
  price: number;
  ma5: number;
  ma25: number;
  ma200: number;
  rsi: number;
  aboveMA200: boolean;
  ma5AboveMA25: boolean;
};

export function computeIndicators(prices: number[]): StockIndicators {
  const last = prices.length - 1;
  const ma5Arr = calculateSMA(prices, 5);
  const ma25Arr = calculateSMA(prices, 25);
  const ma200Arr = calculateSMA(prices, 200);

  const price = prices[last];
  const ma5 = ma5Arr[last];
  const ma25 = ma25Arr[last];
  const ma200 = ma200Arr[last];
  const rsi = calculateRSI(prices);

  return {
    price,
    ma5,
    ma25,
    ma200,
    rsi,
    aboveMA200: price > ma200,
    ma5AboveMA25: ma5 > ma25,
  };
}
