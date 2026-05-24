# Skill: stock-analyze

## Purpose

Look up a stock ticker, fetch its latest quote and indicators, and return a concise summary in the user's language.

## When to use

The user asks about a stock, ticker, price, or 銘柄.

## Steps

1. Parse the user's request to identify the ticker symbol. Use Yahoo Finance conventions (e.g. `7203.T` for Toyota, `AAPL` for Apple).
2. Call `mcp__stock__get_quote` with the symbol to retrieve the latest price, change %, and market state.
3. Call `mcp__stock__get_indicators` to retrieve standard indicators if useful.
4. Synthesize a 2–4 sentence report. Include the ticker, price, change, and one notable observation.
5. If the symbol cannot be resolved, ask the user to clarify.

## Output style

- Match the user's language (Japanese if the request is in Japanese).
- Cite the timestamp included in the quote response when relevant.
- Do not invent numbers; only report values returned by the tools.
