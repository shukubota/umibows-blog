/* eslint-disable @typescript-eslint/no-explicit-any */
import YahooFinance from "yahoo-finance2";
import { withCache } from "./cache.js";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

export type Quote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number | null;
  currency: string | null;
  marketState: string | null;
};

export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type SearchResult = {
  symbol: string;
  name: string;
  exchange: string | null;
  quoteType: string | null;
};

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(3, i)));
      }
    }
  }
  throw lastErr;
}

export async function getQuote(symbol: string): Promise<Quote> {
  return withCache(`quote:${symbol}`, 60, async () => {
    const q: any = await withRetry(() =>
      yf.quote(symbol, {}, { validateResult: false }),
    );
    return {
      symbol,
      name: (q.shortName ?? q.longName ?? symbol) as string,
      price: (q.regularMarketPrice ?? 0) as number,
      change: (q.regularMarketChange ?? 0) as number,
      changePercent: (q.regularMarketChangePercent ?? 0) as number,
      volume: (q.regularMarketVolume ?? 0) as number,
      marketCap: (q.marketCap ?? null) as number | null,
      currency: (q.currency ?? null) as string | null,
      marketState: (q.marketState ?? null) as string | null,
    };
  });
}

export type QuoteOrError = Quote | { symbol: string; error: string };

export async function getQuotes(symbols: string[]): Promise<QuoteOrError[]> {
  return Promise.all(
    symbols.map(async (s) => {
      try {
        return await getQuote(s);
      } catch (err) {
        return { symbol: s, error: (err as Error).message ?? "fetch failed" };
      }
    }),
  );
}

export async function getHistorical(
  symbol: string,
  days: number,
  interval: "1d" | "1wk" | "1mo" = "1d",
): Promise<Candle[]> {
  return withCache(`hist:${symbol}:${days}:${interval}`, 1800, async () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const rows: any[] = await withRetry(() =>
      yf.historical(symbol, { period1: start, period2: end, interval }, { validateResult: false }),
    );
    return rows
      .filter((r) => typeof r.close === "number")
      .map((r) => ({
        date: (r.date instanceof Date ? r.date : new Date(r.date))
          .toISOString()
          .slice(0, 10),
        open: r.open ?? NaN,
        high: r.high ?? NaN,
        low: r.low ?? NaN,
        close: r.close,
        volume: r.volume ?? 0,
      }));
  });
}

export async function getHistoricalCloses(symbol: string, days: number): Promise<number[]> {
  const candles = await getHistorical(symbol, days, "1d");
  return candles.map((c) => c.close).filter((v) => typeof v === "number");
}

export type EarningsInfo = {
  symbol: string;
  date: string;
  epsEstimate: number | null;
};

export async function getEarningsDate(symbol: string): Promise<EarningsInfo | null> {
  return withCache(`earnings:${symbol}`, 3600, async () => {
    try {
      const summary: any = await withRetry(() =>
        yf.quoteSummary(symbol, { modules: ["calendarEvents"] }, { validateResult: false }),
      );
      const earnings = summary?.calendarEvents?.earnings;
      const list: any[] = earnings?.earningsDate ?? [];
      if (list.length === 0) return null;
      const raw = list[0];
      const date = raw instanceof Date ? raw : new Date(raw);
      return {
        symbol,
        date: date.toISOString(),
        epsEstimate: earnings?.earningsAverage ?? null,
      };
    } catch {
      return null;
    }
  });
}

export async function searchSymbols(query: string, limit: number): Promise<SearchResult[]> {
  return withCache(`search:${query}:${limit}`, 86400, async () => {
    const res: any = await withRetry(() => yf.search(query, { quotesCount: limit }));
    const quotes: any[] = res?.quotes ?? [];
    return quotes.slice(0, limit).map((q) => ({
      symbol: q.symbol,
      name: q.shortname ?? q.longname ?? q.symbol,
      exchange: q.exchange ?? null,
      quoteType: q.quoteType ?? null,
    }));
  });
}
