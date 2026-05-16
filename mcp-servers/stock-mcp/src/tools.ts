import { z } from "zod";
import {
  getQuote,
  getQuotes,
  getHistorical,
  getHistoricalCloses,
  getEarningsDate,
  searchSymbols,
  type Quote,
} from "./lib/client.js";
import { computeIndicators } from "./lib/indicators.js";
import { getStockSignal, getMarketMode, SIGNAL_LABEL, MODE_META } from "./lib/condition.js";
import { DEFAULT_MARKET_SYMBOLS, DEFAULT_SECTOR_ETFS } from "./lib/defaults.js";

type TextResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const ok = (data: unknown): TextResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const fail = (message: string): TextResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

const summarize = (closes: number[]) => {
  if (closes.length === 0) return null;
  const first = closes[0];
  const last = closes[closes.length - 1];
  const max = Math.max(...closes);
  const min = Math.min(...closes);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  return {
    count: closes.length,
    first,
    last,
    max,
    min,
    mean,
    changePercent: ((last - first) / first) * 100,
  };
};

export const toolDefs = [
  {
    name: "get_quote",
    description:
      "Get realtime quote (price, change, volume) for a single ticker. Examples: AAPL, NVDA, ^VIX, USDJPY=X. Max 15-min delay.",
    inputSchema: z.object({
      symbol: z.string().describe("Yahoo Finance ticker, e.g. AAPL"),
    }),
    handler: async ({ symbol }: { symbol: string }): Promise<TextResult> => {
      try {
        const data = await getQuote(symbol);
        return ok(data);
      } catch (err) {
        return fail(`Failed to fetch ${symbol}: ${(err as Error).message}`);
      }
    },
  },
  {
    name: "get_quotes",
    description:
      "Batch fetch realtime quotes for multiple tickers (max 20). Failed symbols return an error field instead of failing the whole call.",
    inputSchema: z.object({
      symbols: z.array(z.string()).min(1).max(20).describe("Array of tickers"),
    }),
    handler: async ({ symbols }: { symbols: string[] }): Promise<TextResult> => {
      const results = await getQuotes(symbols);
      return ok(results);
    },
  },
  {
    name: "get_historical",
    description:
      "Daily/weekly/monthly OHLC candles. Use summaryOnly=true for long ranges to avoid bloating context.",
    inputSchema: z.object({
      symbol: z.string(),
      days: z.number().int().min(1).max(3650).default(250).optional(),
      interval: z.enum(["1d", "1wk", "1mo"]).default("1d").optional(),
      summaryOnly: z.boolean().default(false).optional(),
    }),
    handler: async (args: {
      symbol: string;
      days?: number;
      interval?: "1d" | "1wk" | "1mo";
      summaryOnly?: boolean;
    }): Promise<TextResult> => {
      const days = args.days ?? 250;
      const interval = args.interval ?? "1d";
      try {
        const candles = await getHistorical(args.symbol, days, interval);
        if (args.summaryOnly) {
          return ok({
            symbol: args.symbol,
            interval,
            range: { days },
            summary: summarize(candles.map((c) => c.close)),
          });
        }
        return ok({ symbol: args.symbol, interval, candles });
      } catch (err) {
        return fail(`Failed historical for ${args.symbol}: ${(err as Error).message}`);
      }
    },
  },
  {
    name: "get_indicators",
    description:
      "Technical indicators (MA5/25/200, RSI14) and signal classification (strong/overbought/oversold/downtrend/neutral) based on 365 days of closes.",
    inputSchema: z.object({
      symbol: z.string(),
    }),
    handler: async ({ symbol }: { symbol: string }): Promise<TextResult> => {
      try {
        const [quote, closes] = await Promise.all([
          getQuote(symbol).catch(() => null),
          getHistoricalCloses(symbol, 365),
        ]);
        if (closes.length < 200) {
          return fail(
            `Not enough history for ${symbol} (got ${closes.length} closes, need >= 200 for MA200)`,
          );
        }
        const ind = computeIndicators(closes);
        const signal = getStockSignal(ind);
        return ok({
          symbol,
          name: quote?.name ?? symbol,
          ...ind,
          signal,
          signalLabel: SIGNAL_LABEL[signal],
        });
      } catch (err) {
        return fail(`Failed indicators for ${symbol}: ${(err as Error).message}`);
      }
    },
  },
  {
    name: "get_market_overview",
    description:
      "Snapshot of major US indices, VIX, USD/JPY, and Treasury yields. Pass `symbols` map to override defaults.",
    inputSchema: z.object({
      symbols: z.record(z.string()).optional(),
    }),
    handler: async ({
      symbols,
    }: {
      symbols?: Record<string, string>;
    }): Promise<TextResult> => {
      const targets = symbols ?? DEFAULT_MARKET_SYMBOLS;
      const entries = Object.entries(targets);
      const results = await Promise.all(
        entries.map(async ([key, sym]) => {
          try {
            return [key, await getQuote(sym)] as const;
          } catch (err) {
            return [key, { symbol: sym, error: (err as Error).message }] as const;
          }
        }),
      );
      return ok(Object.fromEntries(results));
    },
  },
  {
    name: "get_sector_performance",
    description:
      "S&P 500 sector ETF performance (XLK/XLF/XLV/XLE/XLI/XLY/XLP/XLB/XLU/XLRE/XLC), sorted by change% descending.",
    inputSchema: z.object({
      tickers: z.array(z.string()).optional(),
    }),
    handler: async ({ tickers }: { tickers?: string[] }): Promise<TextResult> => {
      const targets = tickers ?? DEFAULT_SECTOR_ETFS.map((s) => s.ticker);
      const quotes = await getQuotes(targets);
      const valid = quotes.filter((q): q is Quote => "price" in q);
      valid.sort((a, b) => b.changePercent - a.changePercent);
      return ok(valid);
    },
  },
  {
    name: "get_earnings_calendar",
    description:
      "Upcoming earnings dates for given symbols within N days (default 30). Symbols without scheduled earnings are skipped.",
    inputSchema: z.object({
      symbols: z.array(z.string()).min(1).max(30),
      withinDays: z.number().int().min(1).max(365).default(30).optional(),
    }),
    handler: async ({
      symbols,
      withinDays,
    }: {
      symbols: string[];
      withinDays?: number;
    }): Promise<TextResult> => {
      const horizon = withinDays ?? 30;
      const now = Date.now();
      const limit = now + horizon * 24 * 3600 * 1000;
      const results = await Promise.all(symbols.map(getEarningsDate));
      const events = results
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .filter((e) => {
          const t = new Date(e.date).getTime();
          return t > now && t <= limit;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return ok({ events, horizonDays: horizon });
    },
  },
  {
    name: "get_market_condition",
    description:
      "Overall US market mode (bullish/defensive/warning) derived from SPY vs 200d MA and VIX. Includes yield curve context.",
    inputSchema: z.object({}),
    handler: async (): Promise<TextResult> => {
      const [spyCloses, vixQuote, t10, t2] = await Promise.all([
        getHistoricalCloses("SPY", 365),
        getQuote("^VIX").catch(() => null),
        getQuote("^TNX").catch(() => null),
        getQuote("^IRX").catch(() => null),
      ]);

      if (spyCloses.length < 200) {
        return fail("Not enough SPY history to compute MA200");
      }
      const ind = computeIndicators(spyCloses);
      const vix = vixQuote?.price ?? NaN;
      const mode = getMarketMode(ind.aboveMA200, vix);
      const meta = MODE_META[mode];
      const treasury10y = t10?.price ?? NaN;
      const treasury2y = t2?.price ?? NaN;

      return ok({
        mode,
        label: meta.label,
        description: meta.description,
        context: {
          sp500Price: ind.price,
          sp500MA200: ind.ma200,
          sp500AboveMA200: ind.aboveMA200,
          vix,
          treasury10y,
          treasury2y,
          yieldCurveInverted:
            isFinite(treasury10y) && isFinite(treasury2y) ? treasury10y < treasury2y : null,
        },
      });
    },
  },
  {
    name: "search_symbol",
    description:
      "Find ticker symbols by company name or keyword (e.g. 'nvidia', 'semiconductor etf'). Returns up to `limit` matches.",
    inputSchema: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(20).default(5).optional(),
    }),
    handler: async ({
      query,
      limit,
    }: {
      query: string;
      limit?: number;
    }): Promise<TextResult> => {
      try {
        const results = await searchSymbols(query, limit ?? 5);
        return ok({ query, results });
      } catch (err) {
        return fail(`Search failed: ${(err as Error).message}`);
      }
    },
  },
] as const;
