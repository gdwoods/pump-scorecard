# Handoff — pump-scorecard

**Repo:** `/Volumes/Projects/pump-scorecard`
**For:** Claude Code, opened on the repo root.

**Status (29 Aug 2026):** Task A and Task B are **complete** on `main`. Post-handoff prod work (same branch):
Watchlist, Fast Scan CP/AI parity, verdict stack on Short Check, deprecated `weightedRiskScore`,
fraud API removed, Pump Scorecard headline score retired. Verify:
`npx tsx scripts/verify-*.ts` (or `npm run verify`). Rollback baseline:
`rollback/short-check-stable-2026-08-29` @ `247ef57`.

Attach alongside:
- `Short-Selling-Framework-3.0.md` — the governing trading document
- `fast-verdict-endpoint-spec.md` + `fast-verdict-spec-addendum.md` — Task B design

**Two tasks. Do A first.** A fixes live defects in code that runs today; B is
additive. This ordering is a change from the earlier plan, made after reading the
actual source.

---

## Context

Short Check scores short-selling candidates from DilutionTracker screenshots. The
scoring lives in `lib/shortCheckScoring.ts` (1409 lines) and is exercised by
`app/api/short-check/route.ts`. Scan enrichment at
`app/api/scan/[ticker]/route.ts` powers Pump Scorecard, Watchlist, and Short Check.
Legacy `weightedRiskScore` is deprecated (`lib/scan/legacyWeightedRiskScore.ts`);
fraud evidence was removed from the pipeline.

`SHORT_CHECK_COMPLETE_DOCUMENTATION.md` is a long reference — prefer [`README.md`](../../README.md)
and Framework 3.0 for current prod behavior.

### The governing principle

Framework 3.0 §1 sets precedence: **a score is not permission.** No component of
this system may output a verdict that reads as authorization to trade. Screening
kills candidates; humans take trades.

---

# TASK A — Fix the scorer

Six defects, verified by reading the source. Line numbers are current as of this
handoff.

### A1 — Low droppiness can still rate 95% 🔴 *most important*

`lib/shortCheckScoring.ts:1306-1328`

The denominator is fixed at 150 (line 1313). Component maxima sum to 150 *without*
droppiness, and droppiness adds up to +12 on top.

```
all components perfect, droppiness LOW (−8)   →  142 / 150  =  94.7%
                                                  → "High-Priority Short Candidate"
all components perfect, droppiness HIGH (+12)  →  162 / 150  =  108%
```

Two bugs in one place:

1. A stock whose spikes historically **hold** — the exact opposite of the edge —
   rates 94.7% and gets the top category. This is worse than the documentation
   implied (the doc says the denominator is 162, which would have made it 87%).
2. The rating can exceed 100%.

**Fix:** droppiness becomes a walk-away, per Framework 3.0 §2 V1.

- `droppinessScore < T.droppiness.walkAway` **and** `spikeCount >= 3`
  → push a walk-away flag → category `No-Trade`. Unconditionally.
- Also fix the denominator so the rating cannot exceed 100%.

### A2 — Missing droppiness scores as neutral

`lib/shortCheckScoring.ts:786-789` — returns `0` when undefined.

"Never spiked" and "fades half the time" are different epistemic states and only
one is tradeable. The Bayesian calculation has the same issue upstream: zero
spikes yields `pAdj = (0 + 3×0.5)/(0+3) = 0.5` → score 50 → neutral.

**Fix:** thread `spikeCount` through alongside the score. Fewer than 3 spikes ⇒
status `UNVERIFIED`, surfaced in the result and capping the category at
`Speculative` — never contributing a neutral 0 as though it were evidence.

### A3 — The Scalp Override bypasses every walk-away 🔴

`lib/shortCheckScoring.ts:918-965`, applied at `1341-1359`.

```ts
category = isScalp ? 'Speculative Short Candidate' : 'No-Trade';
```

`checkScalpOverride` is **entirely absent from the documentation.** It converts any
walk-away into a tradeable category when: price spike >100%, runway <4mo, market
cap <$150M, and news is none-or-fluff.

What it currently overrides:

- **Double Green Trap** (offering green + supply green) — this is Framework 3.0's
  V5 squeeze geometry. Thin float plus inability to dilute is the configuration
  that kills this strategy, and the override waves it through.
- **Institutional ownership > 75%** — the QURE float-trap veto.
- **Market cap > $100M** — scalp permits up to $150M.

**Fix:** the override may not survive contact with Framework 3.0 §1 ("override is
asymmetric — you may never take a trade the system vetoes"). Preferred: delete it.
If it's retained because it reflects real trading experience, then at minimum it
must not override Double Green, institutional ownership, or the new droppiness
walk-away. **Ask before deleting** — this encodes a judgment call that belongs to
the trader.

### A4 — TRAP_RISK has a units bug

`lib/shortCheckScoring.ts:1366`

```ts
if (data.float && data.float < 2_000_000 && offeringColor === 'Green')
```

Elsewhere the codebase normalizes float units — `:933` uses
`data.float < 1000 ? data.float * 1_000_000 : data.float`, i.e. values under 1000
are understood as millions. Line 1366 skips that normalization, so a float stored
as `5` (meaning 5M shares) satisfies `5 < 2_000_000` and fires TRAP_RISK falsely.

**Fix:** extract the normalization into a shared helper and use it everywhere
float is compared. Then audit every other float comparison in the file.

Separately: TRAP_RISK is only a *label*. Per Framework 3.0 V5 it should be a
walk-away.

### A5 — Missing data scores well

Documented defaults: news fetch failure lands in "no news found" → **+15, the
maximum**; short interest unavailable → +8; institutional ownership unavailable on
a microcap → +5, the maximum.

A total data failure therefore earns roughly 28 unearned points and returns a
confident percentage. The rating cannot distinguish "clean setup" from "we saw
nothing."

**Fix:** track populated components. Emit `dataCompleteness` (populated / 12) in
the result, multiply the rating by it, and force category `No-Trade` below
`T.dataQuality.minCompleteness`. Never let an unavailable source contribute its
maximum.

### A6 — Borrow data is fetched and discarded

`utils/fetchBorrowDesk.ts` exists and is called, but borrow is not among the 12
components.

Borrow *availability* is a hard constraint — no borrow, no trade. (Borrow *cost*
is immaterial at this account size and should not be scored: a $600 position at
100% annualized runs ~$1.64/day.)

**Fix:** availability becomes a walk-away. Do not score the fee.

### A7 — Documentation drift

Category thresholds in `SHORT_CHECK_COMPLETE_DOCUMENTATION.md` say 70–100 / 40–70
/ 20–40 / <20. The code (`:1350-1353`) uses >80 / ≥70 / ≥65 / <65. The doc also
states a 162 denominator; the code uses 150.

**Fix:** update the documentation from the code, and add a note that
`lib/config/thresholds.ts` is the single source of truth for numbers.

---

# TASK B — Build `/api/fast/[ticker]`

Design is in `fast-verdict-endpoint-spec.md`; the addendum amends §4, §5 and §7 —
**apply those amendments as you build, don't build-then-patch.**

Ticker-only, Edge runtime, target p95 under 1.5s. Returns `NO_TRADE` / `WATCH` /
`REVIEW` — never an authorization.

### Scope

**In:** config file, Tier 2 parallel fetchers with per-source timeouts, derived
metrics with runner classification, walk-away chain, `fmt=json|text`, unit tests.

**Out:** the KV droppiness cache and its nightly cron — return
`droppiness: { status: "UNVERIFIED", reason: "not_cached" }` for now. No UI. No
Benzinga (403s on the current plan).

### Reuse, don't rewrite

`utils/` already has `fetchBorrowDesk`, `fetchNews`, `fetchDebtCash`,
`fetchHistoricalOS`, `fetchReverseSplit`, `fetchSentiment`,
`fetchInsiderTransactions`. Use them. If one lacks the timeout behaviour this
endpoint needs, wrap it locally — do not modify the shared version, because
`/api/scan/[ticker]` and `/api/short-check` depend on current behaviour.

Read `app/api/scan/[ticker]/route.ts` first. It already does concurrent
multi-source fetching and is the closest existing pattern.

---

# SHARED — `lib/config/thresholds.ts`

Create first; both tasks consume it. After this exists, **no numeric threshold may
appear as a literal anywhere else.**

```ts
export const T = {
  droppiness:  { walkAway: 40, strong: 70, minSpikes: 3, cacheDays: 7 },
  marketCap:   { ideal: 10e6, max: 50e6 },
  float:       { squeezeFloor: 2e6, thin: 5e6 },
  instOwn:     { ideal: 0.10, walkAway: 0.40 },
  runway:      { ideal: 6, walkAway: 18 },
  runner:      { priorDay: 0.30, threeDay: 0.30 },
  todayMove:   { min: 0.30 },
  borrow:      { requireAvailable: true },
  volume:      { minSharesPerMin: 50_000, anomalyMult: 5 },
  dataQuality: { minCompleteness: 0.70 },
  timeouts:    { perSourceMs: 1500, totalMs: 2500 },
} as const;
```

Note these differ from current code — market cap max drops from $100M to $50M,
institutional ownership walk-away from 75% to 40%, runway walk-away from 24mo to
18mo. That's intended; they come from Framework 3.0. `config/riskWeights.json`
governs a different scorer (Pump Scorecard) and stays as is.

---

# Test fixtures — real, verified

### Runner classification — DFNS daily bars

Every session where the intraday high exceeded the prior close by ≥30%:

| Date | spike | prior day | 3d into today | vol vs 20d | expected |
|---|---|---|---|---|---|
| 2026-03-02 | +52% | −10% | −16% | 22.3x | `MIXED` |
| 2026-05-27 | +30% | −8% | −7% | 4.3x | `MIXED` |
| 2026-06-12 | +35% | −7% | −17% | 72.5x | `CLEAN` |
| 2026-07-17 | +33% | −29% | −59% | 6.8x | `CLEAN` |
| 2026-07-21 | +105% | −19% | −53% | 84.7x | `CLEAN` |

```ts
// c1 = prior close, c2 = 2 sessions ago, c3 = 3 sessions ago
// h20 = max high across the 20 sessions before today
if ((c1 - c3) / c3 > T.runner.threeDay)  return "RUNNER_MULTIDAY";
if ((c1 - c2) / c2 > T.runner.priorDay)  return "RUNNER_YESTERDAY";
if (c1 < h20 * 0.6)                      return "CLEAN";
return "MIXED";
```

### Droppiness — daily-bar approximation

Spike = high ≥30% over prior close; failed = close ≥15% below that day's high.

| Ticker | sessions | spikes | failed | rate | expected |
|---|---|---|---|---|---|
| DFNS | 114 | 5 | 4 | 80% | HIGH |
| ADTX | 389 | 27 | 20 | 74% | HIGH |
| QURE | 389 | 4 | 0 | **0%** | **LOW → walk-away** |

QURE is the regression test that matters. It's a documented blowup in the trader's
own framework, and after A1 it must return `No-Trade`.

### Baby shelf capacity — DFNS

```
0.93M shares × $6.49  = $6.04M public float   (< $75M → S-3 Instr. I.B.6 applies)
$6.04M / 3            = $2.01M annual capacity
quarterly burn          $4.93M
                      ≈ 12 days of operations   → derivedOfferingAbility: "LOW"
```

Matches DilutionTracker's own badge — derivable without the screenshot.

### Polygon snapshot — verified shape

`/v2/snapshot/locale/us/markets/stocks/tickers/DFNS` returns `prevDay` as
`{ o: 3.9699, h: 5.05, l: 3.70, c: 4.35, v: 3648170 }`.

---

# Gotchas

**Cold start dominates.** The work is ~400–800ms warm. Use Edge runtime — the
endpoint is pure `fetch` plus arithmetic. Add a warming cron.

**Snapshot is zeroed outside market hours.** Clears 3:30am ET, repopulates from
4:00am. When `day.v === 0`, fall back to `prevDay` and set `session: "closed"`.

**Keep `adjusted=true` everywhere.** DFNS shows ~$220 in March adjusted vs ~$4 in
July — large reverse split. Mixing conventions corrupts every derived percentage.

**Float units.** See A4. Normalize once, centrally, then audit all comparisons.

**Ticker recycling.** News APIs return items from prior occupants — DFNS returns
2021 articles about a different company (LGL Systems / IronNet). Filter by date
against the current entity; set `tickerRecycleWarning`.

**`loadRiskWeights` dynamic fetch is dead code.** `utils/loadRiskWeights.ts` calls
`fetch("/config/riskWeights.json")` with a relative URL, which cannot resolve
server-side; it always falls through to the static import. Harmless, but don't
copy the pattern.

**Never fetch `company_tickers.json` on the hot path** — ~1MB. Cache weekly.

**SEC EDGAR** requires a `User-Agent` header (`name email`), limit 10 req/s.

---

# Definition of done

**Task A**
- [x] QURE-profile input (droppiness 0, 4 spikes) returns `No-Trade`
- [x] Rating cannot exceed 100%
- [x] `spikeCount < 3` surfaces as `UNVERIFIED`, not neutral
- [x] Scalp override deleted (removed from `lib/shortCheckScoring.ts`)
- [x] Float normalization centralized (`lib/normalizeShares.ts`); comparisons audited
- [x] `dataCompleteness` in the result; below threshold forces `No-Trade`
- [x] Borrow unavailable is a walk-away
- [x] `SHORT_CHECK_COMPLETE_DOCUMENTATION.md` matches the code (denominator 162 w/ droppiness)
- [x] `__tests__/shortCheckScoring.test.ts` extended; existing tests still pass

**Task B**
- [x] `GET /api/fast/DFNS` returns valid JSON under 1.5s warm
- [x] Runner classification matches all five DFNS fixtures (`verify-task-b.ts`)
- [x] Baby shelf math yields `LOW` for DFNS
- [x] Killing any one source still returns a response, source listed in
      `unavailable[]`, `dataCompleteness` reduced
- [x] Every walk-away rule has a test proving it fires alone (`verify-task-b.ts`)
- [x] No code path emits a verdict other than `NO_TRADE` / `WATCH` / `REVIEW`
- [x] Screenshot flow untouched; its tests still pass

---

# Later — not now

1. ~~KV droppiness cache + nightly cron~~ — **done** (`/api/cron/droppiness`, 06:00 UTC).
   Prod smoke (Aug 2026): droppiness still `not_cached` for DFNS/AAPL — verify KV
   token auth and optional `DROPPINESS_WATCHLIST` env.
2. Wire RSS poller (GlobeNewswire, ACCESSWIRE, Business Wire, PRNewswire) →
   `news:{ticker}` in KV. The current news source misses microcap catalysts
   entirely — verified: `/v2/reference/news` returned nothing for either July
   DFNS spike.
3. Extend the Green-Offering float penalty through the 5M band (currently stops
   at 1M)
4. **Fast Scan improvements** — widely used; next: burn enrichment on ticker-only
   path, droppiness KV hits, re-enable `SHOW_FAST_VERDICT_UI` when trustworthy.
5. **Threshold calibration** — monthly entry-log review:
   `docs/framework/entry-log-calibration.md`
