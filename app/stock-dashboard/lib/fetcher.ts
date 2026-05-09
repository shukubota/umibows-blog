/* eslint-disable @typescript-eslint/no-explicit-any */
import YahooFinance from "yahoo-finance2";
import { computeIndicators } from "./indicators";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export type QuoteData = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
};

export type StockDetail = QuoteData & {
  volume: number;
  avgVolume: number;
  prices: number[];
  ma5: number;
  ma25: number;
  ma200: number;
  rsi: number;
  aboveMA200: boolean;
  ma5AboveMA25: boolean;
};

export type EarningsEvent = {
  symbol: string;
  name: string;
  date: Date;
  epsEstimate: number | null;
};

async function safeQuote(symbol: string): Promise<QuoteData | null> {
  try {
    const q: any = await yahooFinance.quote(symbol, {}, { validateResult: false });
    return {
      symbol,
      name: (q.shortName ?? q.longName ?? symbol) as string,
      price: (q.regularMarketPrice ?? 0) as number,
      change: (q.regularMarketChange ?? 0) as number,
      changePercent: (q.regularMarketChangePercent ?? 0) as number,
    };
  } catch {
    return null;
  }
}

async function safeHistorical(symbol: string, days = 250): Promise<number[]> {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const rows: any[] = await yahooFinance.historical(
      symbol,
      { period1: start, period2: end, interval: "1d" },
      { validateResult: false },
    );
    return rows.map((r) => r.close).filter((v: any) => typeof v === "number");
  } catch {
    return [];
  }
}

export async function fetchMarketOverview(
  symbols: Record<string, string>,
): Promise<Record<string, QuoteData | null>> {
  const entries = Object.entries(symbols);
  const results = await Promise.all(
    entries.map(([key, sym]) => safeQuote(sym).then((q) => [key, q] as const)),
  );
  return Object.fromEntries(results);
}

export async function fetchSectorData(tickers: string[]): Promise<QuoteData[]> {
  const results = await Promise.all(tickers.map(safeQuote));
  return results.filter((r): r is QuoteData => r !== null);
}

export async function fetchWatchlistDetail(tickers: string[]): Promise<StockDetail[]> {
  return Promise.all(
    tickers.map(async (symbol) => {
      const [quote, prices] = await Promise.all([safeQuote(symbol), safeHistorical(symbol, 365)]);
      const ind = prices.length >= 200 ? computeIndicators(prices) : null;

      let volume = 0;
      let avgVolume = 0;
      try {
        const q: any = await yahooFinance.quote(symbol, {}, { validateResult: false });
        volume = q.regularMarketVolume ?? 0;
        avgVolume = q.averageDailyVolume3Month ?? 0;
      } catch {
        // skip
      }

      return {
        symbol,
        name: quote?.name ?? symbol,
        price: quote?.price ?? 0,
        change: quote?.change ?? 0,
        changePercent: quote?.changePercent ?? 0,
        volume,
        avgVolume,
        prices,
        ma5: ind?.ma5 ?? NaN,
        ma25: ind?.ma25 ?? NaN,
        ma200: ind?.ma200 ?? NaN,
        rsi: ind?.rsi ?? NaN,
        aboveMA200: ind?.aboveMA200 ?? false,
        ma5AboveMA25: ind?.ma5AboveMA25 ?? false,
      };
    }),
  );
}

export async function fetchEarningsCalendar(tickers: string[]): Promise<EarningsEvent[]> {
  const events: EarningsEvent[] = [];
  await Promise.all(
    tickers.map(async (symbol) => {
      try {
        const summary: any = await yahooFinance.quoteSummary(
          symbol,
          { modules: ["calendarEvents"] },
          { validateResult: false },
        );
        const earnings = summary?.calendarEvents?.earnings;
        if (earnings?.earningsDate?.length > 0) {
          const date = new Date(earnings.earningsDate[0]);
          if (date > new Date()) {
            events.push({
              symbol,
              name: symbol,
              date,
              epsEstimate: earnings.earningsAverage ?? null,
            });
          }
        }
      } catch {
        // skip
      }
    }),
  );
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}
