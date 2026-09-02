# TradeThePinnacle — competitive notes (deferral)

Reference scan: competitor feature breakdown vs pump-scorecard. Use for **design validation**, not as a build spec.

## Explicitly deferred (product-identity decision required)

Do **not** start these without a deliberate choice to become a market-wide discovery terminal:

- Live universe dilution feed (3,000+ tickers, push-first)
- Full persistent screener with paid SI/DTC columns
- Market-wide SEC feed with LLM rewrite on every filing
- Persistent pump-and-dump flag counter per ticker

**Why:** This stack is a **veto funnel** (Telegram alert → Fast Scan → Short Check → manual §2 vetoes). TTP is **push-first discovery**. A universe feed as the home screen would change product identity and EDGAR/cron infra requirements (persistent store, rate limits, refresh policy) beyond current Hobby cron limits.

## Safe to adopt (per-ticker, evidence-first)

Implemented or tracked separately:

- Filed vs Issued + % of float on Capital Pressure events
- Form 4 XML parse + Form 144 intent-to-sell
- Set vs Possible certainty on catalysts / compliance deadlines
- Dense Capital key/value companion (optional)
- Watchlist v2 cards (user-chosen tickers, still pull)

## Current thin push layer (already shipped)

- Wire-news cron + ticker extraction
- Droppiness universe seeded from Polygon top gainers (~20)
- User watchlist (paste tickers)

These are **not** equivalent to TTP’s continuous EDGAR universe scan.
