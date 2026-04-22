# Dilution Monitor — technical reference

Shareable overview of the **Dilution Monitor** feature in **pump-scorecard**: routes, APIs, data flow, caching, and operational notes.

---

## Purpose

A browser dashboard for **quick dilution context on moving names**: left rail(s) for **top gainers** from market data vendors, right column for **Ask Edgar** aggregates (risk, filings-style news, in-play warrants/convertibles, registrations, etc.), optional **TradingView** chart, **watchlist**, and **stock splits** (Polygon/Massive-backed).

**Primary route:** `/dilution-monitor`  
**Shell:** `app/dilution-monitor/page.tsx` → client component `components/dilution-monitor/DilutionMonitor.tsx`.

---

## Architecture (high level)

```
Browser (DilutionMonitor.tsx)
  │
  ├─► GET /api/top-gainers              (Polygon movers + optional AE badges; TV fallback)
  ├─► GET /api/gainers/fmp              (FMP biggest gainers + optional AE badges)
  ├─► GET /api/ask-edgar/detail/:sym    (aggregated Ask Edgar JSON, server-cached)
  ├─► GET /api/stock-splits/:sym        (split history when detail rail is “rich” enough)
  └─► localStorage                      (layout toggles + watchlist; no server sync)
```

All vendor keys stay **server-side** (Next.js Route Handlers). The browser never receives `POLYGON_API_KEY`, `ASKEDGAR_API_KEY`, or `FMP_API_KEY`.

---

## Environment variables

| Variable | Required for | Notes |
|----------|----------------|-------|
| `POLYGON_API_KEY` | Polygon movers + stock splits API | Used by `/api/top-gainers` and split helper paths. |
| `ASKEDGAR_API_KEY` (or `ASK_EDGAR_API_KEY`, `ASKEDGAR_KEY`, `ASK_EDGAR_KEY`) | Ask Edgar on gainers + full detail | Resolver: `getAskEdgarApiKeyFromEnv()` in `lib/topGainers.ts` — **static** `process.env.*` reads only (Next bundler). |
| `FMP_API_KEY` | FMP column | `getFmpApiKeyFromEnv()` in `lib/fmpGainers.ts`. If unset, `/api/gainers/fmp` returns **503** and the UI shows a message. |

---

## HTTP API (this app)

### `GET /api/top-gainers`

- **Runtime:** Node.
- **Dynamic:** `force-dynamic`.
- **Polygon:** `GET https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/gainers` (+ optional `include_otc=true`).
- **Normalization:** `normalizePolygonGainer()` — price from `lastTrade.p` → `min.c` → `day.c`; volume from `day.v` → `min.v`.
- **Filters:** `TOP_GAINERS_MIN_CHANGE_PCT` (20), price band `TOP_GAINERS_MIN_PRICE` / `TOP_GAINERS_MAX_PRICE` (0.60–25 USD), ticker regex `^[A-Z]{2,4}$`.
- **Fallback:** If Polygon returns **zero** rows and `tvFallback` is not disabled, **TradingView** `POST https://scanner.tradingview.com/america/scan` with **premarket** columns, sorted by `premarket_change` (see `fetchTradingViewGainersFallback()`). Response JSON includes `source: "polygon" | "tradingview"`.
- **Ask Edgar enrichment:** First **20** symbols batched with concurrency **4** (`enrichRowsWithAskEdgar`) — dilution rating only (`overall_offering_risk` for list badges). Query `enrich=0` skips. No key → all `askEdgar: null`.
- **Cache header:** `Cache-Control: public, s-maxage=45, stale-while-revalidate=120`.

**Query params (subset):** `includeOtc=1`, `enrich=0`, `tvFallback=0`.

---

### `GET /api/gainers/fmp`

- **Runtime:** Node, `force-dynamic`.
- **Upstream:** `https://financialmodelingprep.com/stable/biggest-gainers?apikey=…`
- **Filters:** Same min % / price band / 2–4 letter tickers as Polygon path (`lib/fmpGainers.ts` + `topGainers` constants).
- **Ask Edgar:** Same `enrichRowsWithAskEdgar` when key present.
- **Cache header:** `public, s-maxage=60, stale-while-revalidate=120`.

---

### `GET /api/ask-edgar/detail/[ticker]`

- **Runtime:** Node.
- **Auth:** `503` if no Ask Edgar key; **400** if ticker not `^[A-Z]{1,6}$`.
- **Implementation:** `loadAskEdgarDetailCached()` in `lib/askEdgarDetail.ts` (in-process LRU-style cache, 30 min TTL, max 200 entries; skipped for rate-limit / auth-error payloads).

**Successful response:** JSON matching `AskEdgarDetailPayload`:

| Field | Source (Ask Edgar base `eapi.askedgar.io`) |
|-------|---------------------------------------------|
| `dilution` | `enterprise/v1/dilution-rating` then `v1/dilution-rating` fallback |
| `floatData` | `enterprise/v1/float-outstanding` |
| `newsFeed` | Built from `enterprise/v1/news` (sorted headlines `news` / `8-K` / `6-K`, slice 6) + optional synthetic `form_type: "grok"` line from Grok-shaped news rows |
| `chartAnalysis` | `v1/ai-chart-analysis` |
| `screener` | `enterprise/v1/screener` → mapped slice: `price`, `short_float` → `shortFloat`, `feerate` → `feeRate`, `days_to_cover`, `vol_avg`, `exchange` |
| `registrations` | `enterprise/v1/registrations` → `results[]` |
| `stockPrice` | Screener `price`, else `dilution.last_price` |
| `inPlay` | Derived from `enterprise/v1/dilution-data` via `filterInPlayDilution()` (4× price cap vs `stockPrice`, warrant vs convertible heuristics, “Not Registered” + ~180d filing window — ported from reference `das_monitor.py` idea) |
| `offerings` | `v1/offerings` |
| `meta` | `{ rateLimited?: true }` if any sub-call saw **429**; `{ authError?: true }` on **401/403** |

**HTTP cache (CDN/browser):** If payload is cacheable (no `meta.rateLimited` / `meta.authError`):  
`Cache-Control: public, max-age=1800, s-maxage=1800, stale-while-revalidate=7200`  
Else: `private, no-store`.

**Per-request HTTP:** `aeGet()` uses **14s** timeout, `cache: "no-store"`, header `API-KEY: <key>`.

---

### `GET /api/stock-splits/[ticker]`

Loaded from the client when `symForDetail` is set **and** the “detail rail” is considered non-empty (dilution, registrations, offering desc, in-play, offerings). Used for the **Stock splits** block.

---

## Ask Edgar throttling

`lib/askEdgarThrottle.ts`: global **sliding 60s window** on `globalThis` (so serverless duplicate bundles still share one limiter when colocated). Target **148** starts/min (margin under documented **150**/min). Every `aeGet` awaits `acquireAskEdgarRequestSlot()` before `fetch`.

---

## Client UI behavior (`DilutionMonitor.tsx`)

### Gainer columns

- **MOVERS (Polygon / TV):** `fetch("/api/top-gainers", { cache: "no-store" })`. Footer line shows `source` when present.
- **FMP GAINERS:** Loaded when **Layout** has FMP column enabled, after `localStorage` hydration: `GET /api/gainers/fmp`.

### Selection & manual symbol

- Auto-selects first Polygon row when list loads.
- **GO** + manual input: validates `^[A-Z]{1,6}$`, sets selection, **prepends** a stub row to Polygon list so detail/splits can run even if the symbol is absent from movers.

### Detail panel

- `GET /api/ask-edgar/detail/${sym}` — **client-side Map cache** 30 min for successful JSON (`detailJsonCacheable` — not when `meta.rateLimited` / `meta.authError`).
- **Screener strip:** short float, fee, days-to-cover, vol avg, exchange (with formatting helpers for % / small fees).
- **Chart:** `TradingViewChartEmbed` — loads `https://s3.tradingview.com/tv.js`, `new TradingView.widget({…})`, symbol `${prefix}:${ticker}` where `prefix` is inferred from Ask Edgar `exchange` (NASDAQ / NYSE / AMEX / OTC; default AMEX).
- **Ask Edgar links:** `isAskEdgarWebUrl()` → in-app `AskEdgarWebModal`; else `window.open`.

### Layout & watchlist (`lib/dilutionMonitorStorage.ts`)

| Key | Content |
|-----|---------|
| `dilution-monitor:settings:v1` | `{ showPolygonColumn, showFmpColumn, showChart, showWatchlistColumn }` — all default **true** |
| `dilution-monitor:watchlist:v1` | `string[]` of tickers `^[A-Z]{1,6}$` |

**Watch+** adds `selected` to watchlist. Watchlist row click selects symbol and may stub-prepend to Polygon list.

---

## Related pages

- `/top-gainers` — table-oriented view of the same Polygon/TV movers API (`components/TopGainersPanel.tsx`).
- Home / pump-scorecard nav links to dilution monitor and top gainers as applicable.

---

## Ask Edgar usage / burn controls

- **Detail:** Server cache **45 min** per ticker (in-process) + **in-flight dedupe** (concurrent same-symbol requests share one upstream batch). HTTP `Cache-Control` **45 min** (`max-age`/`s-maxage` 2700s) when not rate-limited. Client session cache **45 min** per ticker.
- **Movers enrichment:** Only the **first N** rows get a dilution-rating call per refresh. **N defaults to 12** (was 20). Set **`ASK_EDGAR_ENRICH_LIMIT`** to `0`–`20` in env to tune (e.g. `20` restores previous badge coverage).
- **Movers API cache:** `Cache-Control` includes **`max-age=120`** (browser) and **`s-maxage=180`** (shared caches) so identical refreshes hit the network less often.
- **UI:** First selected symbol loads detail **immediately**; subsequent ticker changes are **debounced ~280ms** so fast click-through triggers one detail load.

## Operational caveats

1. **Polygon movers empty windows:** Documented in code comments — snapshot can clear overnight / before refill; TV fallback is **unofficial** scanner traffic.
2. **Rate limits:** Dilution detail fans out **many** Ask Edgar calls per ticker; 429 surfaces in UI + skips server cache for that payload shape.
3. **Serverless:** In-process detail cache is **best-effort** per warm instance, not a distributed cache.
4. **TradingView:** Widget depends on TradingView CDN + symbol resolution; wrong `exchange` prefix can show wrong venue (heuristic).
5. **API versioning:** Ask Edgar’s public docs mention **`/enterprise/v1/*` → `/v1/*` redirects**; this codebase still uses `eapi.askedgar.io` enterprise paths for several resources — worth tracking vendor changelog for canonical hosts and auth.

---

## File index (implementation)

| Path | Role |
|------|------|
| `app/dilution-monitor/page.tsx` | Route shell |
| `components/dilution-monitor/DilutionMonitor.tsx` | Main UI + data orchestration |
| `components/dilution-monitor/TradingViewChartEmbed.tsx` | TV widget lifecycle |
| `components/dilution-monitor/AskEdgarWebModal.tsx` | In-app webview for Ask Edgar URLs |
| `lib/askEdgarDetail.ts` | Server aggregator + types + in-play filter |
| `lib/askEdgarThrottle.ts` | Global request throttle |
| `lib/topGainers.ts` | Polygon/TV movers + Ask Edgar row enrichment |
| `lib/fmpGainers.ts` | FMP row fetch |
| `lib/dilutionMonitorStorage.ts` | localStorage keys + types |
| `app/api/top-gainers/route.ts` | Movers API |
| `app/api/gainers/fmp/route.ts` | FMP movers API |
| `app/api/ask-edgar/detail/[ticker]/route.ts` | Detail API |

---

## Changelog (this doc)

- **2026-04-22:** Burn-control notes (caches, enrich cap, debounce, HTTP cache on movers).
- **2026-04-22:** Initial version (post–FMP column, screener, registrations, TV chart, watchlist, layout toggles).
