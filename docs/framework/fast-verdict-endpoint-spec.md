# `/api/fast/[ticker]` — Fast Verdict Endpoint Spec

Target: **p95 under 1.5s warm.** Ticker in, kill-or-escalate out.

## Design principle

**The fast path never says "take this trade."** It emits `NO_TRADE`, `WATCH`, or
`REVIEW`. `REVIEW` means "not obviously disqualified — now go look." Blessing a
trade requires Tier 3 judgment and a human. A screening tool that returns a green
light becomes a green light generator.

---

## 1. Route

```
GET /api/fast/[ticker]?fmt=json|text
```

Runtime: **Edge**, not Node. This endpoint is pure `fetch` + arithmetic — no
Sharp, no pdfkit — so it qualifies, and Edge cold starts are ~10x faster than
Node serverless. Cold start is the single most likely thing to blow your latency
budget; everything else here is comfortably in range.

Also add a warming cron (`*/5 13-21 * * 1-5` UTC) hitting `/api/fast/AAPL` to keep
the function hot through the session.

---

## 2. Config — single source of truth

Every threshold lives here and nowhere else. This file is what Framework 3.0
references instead of restating numbers in prose.

```ts
// lib/config/thresholds.ts
export const T = {
  droppiness:   { walkAway: 40, strong: 70, minSpikes: 3, cacheDays: 7 },
  marketCap:    { ideal: 10e6, max: 50e6 },
  float:        { squeezeFloor: 2e6, thin: 5e6 },
  instOwn:      { ideal: 0.10, walkAway: 0.40 },
  runway:       { ideal: 6, walkAway: 18 },              // months
  runner:       { priorDay: 0.30, threeDay: 0.30 },      // framework rule
  todayMove:    { min: 0.30 },                           // must be up 30%+
  borrow:       { maxFeePct: 100, requireAvailable: true },
  volume:       { minSharesPerMin: 50_000, anomalyMult: 5 },
  dataQuality:  { minCompleteness: 0.70 },
  timeouts:     { perSourceMs: 1500, totalMs: 2500 },
} as const;
```

Values above are my recommendations from the memo — you flagged none of them, so
treat them as defaults to override, not decisions I've made for you.

---

## 3. Tier 1 — cached (target: <40ms)

Two KV reads, both O(1).

| Key | Value | Refresh |
|---|---|---|
| `drop:{ticker}` | `{ score, spikeCount, nEff, computedAt, method }` | nightly cron |
| `cik:map` | ticker → CIK, full map | weekly |

**Never fetch `company_tickers.json` on the hot path.** It's ~1MB. Load it weekly
into KV as a flat map.

**Cache miss on droppiness must not block.** Return `droppiness: { status:
"UNVERIFIED", reason: "not_cached" }`, fire the compute async (`waitUntil`), and
carry on. A miss converts a 600ms response into a 30s response otherwise — which
is exactly the failure you're trying to design out.

### Nightly droppiness cron

Universe: every ticker that appeared in the top ~200 gainers on any of the last 30
sessions, plus a manual watchlist. Pump names recur — that's the droppiness thesis
applied to your own cache design, and it keeps the universe at a few hundred
rather than 8,000.

Grouped daily (`/v2/aggs/grouped/locale/us/market/stocks/{date}`) gives you a whole
session in one call, so building the universe costs 30 calls.

Keep your existing Bayesian 1-minute/8-hour method as the cached value — it's the
better estimator and latency is irrelevant offline. Add the two P1 fixes:

- Store `spikeCount` alongside `score`; `spikeCount < T.droppiness.minSpikes`
  ⇒ status `UNVERIFIED`, never `neutral`.
- Zero spikes ⇒ `UNVERIFIED`, not 50.

For ad-hoc misses, a daily-bar approximation is one API call and lands close
enough for triage (validated: DFNS 80% / ADTX 74% / QURE 0% — QURE being one of
your two documented blowups).

---

## 4. Tier 2 — parallel live (target: <1.2s)

All six fire concurrently under `Promise.allSettled` with a hard 1500ms per-source
timeout. **Any source that fails is marked `unavailable` and lowers
`dataCompleteness`. It never scores as good news** — that's the P1 defect where a
dead news feed earned +15.

| # | Source | Call | Gives | Timeout |
|---|---|---|---|---|
| 1 | Polygon | `/v2/snapshot/locale/us/markets/stocks/tickers/{t}` | today O/H/L/C/V, prevDay, last minute, `todaysChangePerc` | 800ms |
| 2 | Polygon | `/v2/aggs/ticker/{t}/range/1/day/{t-45d}/{today}` | 3d/5d/20d context, vol baseline, 20d high | 1000ms |
| 3 | SEC | `data.sec.gov/submissions/CIK{cik}.json` | recent filings + dates + forms | 1200ms |
| 4 | iBorrowDesk | `/api/ticker/{t}` | borrow available, fee | 1000ms |
| 5 | Yahoo | `quote()` | float, O/S, mktcap, IO, SI | 1200ms |
| 6 | Yahoo/Finnhub | news | headline check | 1000ms |

Verified on the snapshot endpoint: it clears at 3:30am ET and starts updating from
4:00am, so it covers the premarket session your framework trades. `prevDay` on
DFNS returned `o 3.97 / h 5.05 / l 3.70 / c 4.35` — matching the DT screenshot's
regular-hours close.

SEC requires a `User-Agent` header (`name email`) and rate-limits at 10 req/s.

---

## 5. Filing classification — the highest-value fast check

Classify anything filed **today or yesterday**. This is the part that answers
"what's the catalyst" without an LLM.

| Form | Meaning | Signal |
|---|---|---|
| `424B5` / `424B4` / `424B3` | Offering being **priced** | 🟢 **CONFIRM** — selling into your pump |
| `EFFECT` | Registration went effective | 🟢 CONFIRM — dilution unlocked |
| `S-1` / `S-3` / `S-3ASR` | Shelf registered | 🟢 Supportive |
| `8-K` | Material event | ⚠️ **Needs Tier 3** — pull item codes |
| `8-K` item 1.01 | Material definitive agreement | ⚠️ Could be a real contract |
| `8-K` item 2.02 | Results | ⚠️ |
| `SC 13D` | Activist stake | 🔴 Caution |
| `25` / `25-NSE` | Delisting | 🟢 Supportive |
| `4` | Insider transaction | ⚠️ Direction matters |
| *(none in 5d)* | Unexplained move | ⚠️ Needs Tier 3 |

**A `424B5` dated today during a 30%+ spike is your thesis confirming in real
time** — they're pricing an offering into the move. That's a deterministic string
match against EDGAR, not a judgment call, and it's the single most valuable thing
this endpoint returns.

---

## 6. Derived metrics

Pure arithmetic on Tier 2 output, sub-millisecond:

```ts
todayMovePct   = (day.h - prevDay.c) / prevDay.c
priorDayPct    = (c[-1] - c[-2]) / c[-2]
threeDayRunPct = (c[-1] - c[-4]) / c[-4]
volVs20d       = day.v / avg(v[-20..-1])
pctOff20dHigh  = (c[-1] - max(h[-20..-1])) / max(h[-20..-1])
runwayMonths   = cash / quarterlyBurn * 3
floatRotation  = day.v / float
```

**Runner classification** — the framework gate that exists in neither the app nor
the Gem today:

```ts
if (priorDayPct > T.runner.priorDay)        → "RUNNER_YESTERDAY"   // walk away
else if (threeDayRunPct > T.runner.threeDay) → "RUNNER_MULTIDAY"   // walk away
else if (pctOff20dHigh < -0.40)              → "CLEAN"             // out of nowhere
else                                          → "MIXED"
```

Validated against DFNS: all five 30%+ spike days came off *down* prior days
(−7%, −8%, −19%, −29%) into a downtrend. Clean profile every time.

---

## 7. Walk-away evaluation

Evaluate in order; first hit wins and short-circuits. Cheapest and most decisive
first.

| # | Condition | Verdict |
|---|---|---|
| W1 | `dataCompleteness < 0.70` | `WATCH` — insufficient data |
| W2 | `todayMovePct < 0.30` | `NO_TRADE` — doesn't meet entry criteria |
| W3 | runner = `RUNNER_YESTERDAY` or `RUNNER_MULTIDAY` | `NO_TRADE` |
| W4 | borrow unavailable | `NO_TRADE` |
| W5 | `droppiness.score < 40` and `spikeCount >= 3` | `NO_TRADE` |
| W6 | `instOwn >= 0.40` | `NO_TRADE` — float trap |
| W7 | `marketCap > 50e6` | `NO_TRADE` |
| W8 | `runwayMonths >= 18` or positive FCF | `NO_TRADE` |
| W9 | `float < 2e6` and offering ability not HIGH | `NO_TRADE` — squeeze geometry |
| — | otherwise | `REVIEW` |

W9 is the DFNS case: 0.93M float with `Offering Ability: LOW` is the geometry
where you can't borrow, they can't dilute fast enough to cap it, and the move runs.

Soft flags — surfaced, never fatal: droppiness `UNVERIFIED`, borrow fee above
`maxFeePct`, narrative sector (defense/AI/crypto/quantum/space/nuclear), unexplained
move with no filings, `volVs20d` extreme.

---

## 8. Response schema

```ts
type FastVerdict = {
  ticker: string;
  verdict: "NO_TRADE" | "WATCH" | "REVIEW";
  reason: string | null;              // the W-rule that fired
  elapsedMs: number;
  dataCompleteness: number;           // 0–1, sources answered / attempted

  price:  { last: number; todayMovePct: number; volVs20d: number;
            floatRotation: number | null };
  runner: { class: "CLEAN"|"MIXED"|"RUNNER_YESTERDAY"|"RUNNER_MULTIDAY";
            priorDayPct: number; threeDayRunPct: number; pctOff20dHigh: number };
  droppiness: { status: "OK"|"UNVERIFIED"; score: number|null;
                spikeCount: number|null; computedAt: string|null };
  filings: { today: Array<{ form: string; filedAt: string;
                            signal: "CONFIRM"|"CAUTION"|"REVIEW" }>;
             daysSinceLast: number|null };
  fundamentals: { marketCap: number|null; float: number|null;
                  instOwn: number|null; shortInterest: number|null;
                  runwayMonths: number|null };
  borrow: { available: boolean|null; feePct: number|null };
  flags: string[];                    // soft warnings
  unavailable: string[];              // sources that failed — never silent
};
```

`?fmt=text` returns the same thing as a paste-ready block for Tier 3:

```
DFNS  REVIEW   (412ms, data 5/6)
Move    +105% today | vol 85x 20d avg | float rot 3.9x
Runner  CLEAN — prior day −19%, 3d −53%, 53% off 20d high
Drop    80 (5 spikes, cached 2026-07-25)
Filings 424B5 filed today 09:14 ET  ← CONFIRM: pricing into the pump
Fund    cap $7.3M | float 0.93M | IO 1.7% | SI 7.8% | runway 5.1mo
Borrow  available, 42% fee
FLAGS   thin float 0.93M w/ LOW offering ability — squeeze geometry
        narrative sector: defense
MISSING news feed (timeout)
```

---

## 9. Latency budget

| Stage | Warm | Cold (Edge) |
|---|---|---|
| Cold start | — | 150–400ms |
| Tier 1 KV (2 reads, parallel) | 20–40ms | 20–40ms |
| Tier 2 (6 calls, parallel, capped) | 300–1200ms | 300–1200ms |
| Derived math | <5ms | <5ms |
| Serialize | <5ms | <5ms |
| **Total** | **~400–800ms** | **~600–1400ms** |

Comfortably inside 5–10s with headroom for a slow source. The budget only breaks
if you put a droppiness computation or an LLM call on this path — don't.

---

## 10. Failure modes to design against

- **Droppiness cache miss blocks the response.** Return `UNVERIFIED` and compute
  async. Never await it.
- **Missing data scores well.** Every unavailable source lands in `unavailable[]`
  and lowers `dataCompleteness`. W1 forces `WATCH` below 0.70.
- **Stale snapshot pre-4am.** Snapshot clears at 3:30am ET. Between 3:30 and the
  first print, `day.*` is zeroed — as it was in my Sunday test. Detect `day.v === 0`
  and fall back to `prevDay`, flagging `session: "closed"`.
- **Split-adjusted history vs unadjusted quotes.** Keep `adjusted=true` everywhere.
  DFNS shows ~$220 in March on an adjusted basis; mixing conventions silently
  destroys every percentage in section 6.
- **Cold starts during quiet periods.** The warming cron matters more than any
  other optimization here.

---

## 11. Build order

1. Config file + response types. Nothing else references a literal number again.
2. Tier 2 fetchers with timeouts and `Promise.allSettled`. Test each in isolation.
3. Derived metrics + runner classification. Unit-test against the DFNS dates in
   this spec — you have known-good expected values for all five spike days.
4. Walk-away chain. Test that each rule fires alone.
5. KV droppiness cache + nightly cron. Ship with `UNVERIFIED` until it's populated.
6. `fmt=text`, then wire it as the Gem's input.

Steps 1–4 are the whole latency win and need no new infrastructure. Step 5 is the
only piece requiring a cron and a KV namespace.
