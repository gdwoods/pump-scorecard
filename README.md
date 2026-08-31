# Pump Scorecard

Evidence-based risk analysis for microcap and OTC equities. Surfaces structural, volume, float, dilution, and capital-pressure signals from public market data and SEC EDGAR filings.

**Production:** https://short-check.vercel.app

## What's included

| Surface | Route | Description |
|---------|-------|-------------|
| **Short Check** | `/short-check` | DT screenshot OCR → Short Rating %, **verdict stack** (Fast Verdict + fundamental context + walk-aways), Capital Pressure, AI thesis |
| **Fast Scan** | `/fast-scan` | Ticker-only: Fast Verdict, Droppiness, Capital Pressure, AI thesis |
| **Watchlist** | `/watchlist` | Parallel scan (up to 20 tickers): Fast verdict, Droppiness, CP |
| **Pump Scorecard** | `/pump-scorecard` | Full scan UI: Droppiness + Capital Pressure lead; fundamentals, filings, charts |
| **API** | `GET /api/scan/[ticker]` | Structured scan JSON + optional `capitalPressure` |
| **Fast API** | `GET /api/fast/[ticker]` | Framework 3.0 fast verdict (JSON or `?fmt=text`) |

## Short Check layout (DT screenshot path)

1. **Verdict stack** (one card) — Fast Verdict · Framework 3.0, live metrics, fast flags; **Fundamental context** (DT synopsis + SEC CP note); **Short Check walk-aways**
2. **Capital Pressure** + **AI Thesis**
3. **Short Rating** card — % score, category, alert labels only
4. Score breakdown, alert card, droppiness, fundamentals, etc.

Quick Ticker (no screenshot) shows Fast Verdict + scan cards but **no** Short Rating % or fundamental context block.

## Capital Pressure

Standalone research module that answers:

1. Does this ticker show near-term need to raise capital?
2. Is there a documented mechanism to issue common stock or equivalents?

It is a **research signal**, not a short label and not proof of dilution.

| Item | Detail |
|------|--------|
| Lookback | **12 months** for events; **24 months** only for S-1/S-3/F-1/F-3 registration capacity |
| Pump headline | **Not** folded into deprecated `weightedRiskScore` — shown on its own card |
| Docs | [`docs/CAPITAL_PRESSURE.md`](docs/CAPITAL_PRESSURE.md), [`docs/AI_THESIS.md`](docs/AI_THESIS.md), [`docs/CLAIM_TAGGING.md`](docs/CLAIM_TAGGING.md), [`docs/FORENSIC_REPORT_ROADMAP.md`](docs/FORENSIC_REPORT_ROADMAP.md) |
| Code | `lib/capitalPressure/`, `components/CapitalPressureCard.tsx` |

## Deprecated / removed (Aug 2026)

| Item | Status |
|------|--------|
| `weightedRiskScore` | Deprecated on `/api/scan` (`weightedRiskScoreDeprecated: true`). Legacy vol/price/filing/country flags only — **do not use for decisions** |
| Fraud evidence API | Removed from scan pipeline and UI |
| Pump headline score UI | Removed from Pump Scorecard (Droppiness + CP only) |
| `INCLUDE_CAPITAL_PRESSURE_IN_OVERALL_SCORE` | `false` — frozen |

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

| Variable | Purpose |
|----------|---------|
| `FMP_API_KEY` | Financial Modeling Prep (quotes, fundamentals) |
| `POLYGON_API_KEY` | Market data / fundamentals |
| `GROQ_API_KEY` | AI thesis synthesis (server-side) |
| `GROQ_MODEL` | Groq model override (default `openai/gpt-oss-20b`) |
| `OPENROUTER_API_KEY` | Automatic AI thesis fallback when Groq is rate-limited |
| `OPENROUTER_MODEL` | OpenRouter model override (default `google/gemini-flash-latest`) |
| `AI_THESIS_RATE_LIMIT_WHITELIST` | Comma-separated IPs bypassing thesis rate limit |
| `AI_THESIS_RATE_LIMIT_PER_HOUR` | Per-IP thesis cap (default 10; lower for groups) |
| `AI_THESIS_DAILY_GROQ_BUDGET` | Shared daily Groq API call cap (default 50) |
| `DROPPINESS_WATCHLIST` | Tickers for nightly droppiness cron seeding |
| `CRON_SECRET` | Auth for `/api/cron/droppiness` |
| `SEC_USER_AGENT` | EDGAR identification (email in user-agent string) |
| `KV_*` / Upstash | Droppiness cache, AI thesis cache, share links |

See also [`VERCEL_ENV_SETUP.md`](VERCEL_ENV_SETUP.md).

## Scripts

```bash
npm run dev          # development server
npm run build        # production build
npm run start        # serve production build
npm run lint         # ESLint
npm run verify       # All tsx verification scripts (use npx tsx if needed)
npm test             # Jest (includes capital pressure fixtures)
```

## Project layout

```
app/
  short-check/           # Short Check page
  fast-scan/             # Fast Scan
  watchlist/             # Multi-ticker parallel scanner
  pump-scorecard/        # Full scan UI
  api/scan/[ticker]/     # Scan API
  api/fast/[ticker]/     # Fast Verdict API
  api/ai-thesis/         # Groq thesis synthesis
components/
  CapitalPressureCard.tsx
  short-check/
    FastVerdictCard.tsx      # Fast verdict + optional fundamental context
    ShortCheckResults.tsx
lib/
  shortCheckScoring.ts       # Short Check % rating
  fast/                      # Fast Verdict pipeline
  capitalPressure/           # SEC evidence module
  scan/legacyWeightedRiskScore.ts  # deprecated pump heuristic
  config/features.ts
  config/thresholds.ts       # Framework 3.0 numbers
docs/
  CAPITAL_PRESSURE.md
  AI_THESIS.md
  framework/                 # Framework 3.0, Task A/B handoff, fast verdict specs
scripts/
  verify-*.ts                # Regression scripts (run via npm run verify)
```

## Scoring (two systems — do not conflate)

| System | Output | Use |
|--------|--------|-----|
| **Fast Verdict** | `NO_TRADE` / `WATCH` / `REVIEW` | Framework 3.0 fast screen; binding walk-aways W3–W10 |
| **Short Check rating** | 0–100% + category | DT/OCR fundamentals; walk-aways from `lib/shortCheckScoring.ts` |
| **Capital Pressure** | 0–100 + status | SEC evidence only; research signal |
| **Droppiness** | 0–100 | Spike fade vs hold behavior |
| ~~Pump `weightedRiskScore`~~ | deprecated | Ignore |

## Related docs

| Doc | Purpose |
|-----|---------|
| [`docs/CAPITAL_PRESSURE.md`](docs/CAPITAL_PRESSURE.md) | Capital Pressure module |
| [`docs/AI_THESIS.md`](docs/AI_THESIS.md) | AI Thesis — prompt, API, cache, tuning |
| [`docs/framework/Short-Selling-Framework-3.0.md`](docs/framework/Short-Selling-Framework-3.0.md) | Governing trading framework |
| [`docs/framework/START-HERE.md`](docs/framework/START-HERE.md) | Stack orientation |
| [`docs/framework/TASK-A-B-HANDOFF.md`](docs/framework/TASK-A-B-HANDOFF.md) | Scorer + fast endpoint build history |
| [`SHORT_CHECK_INTRO.md`](SHORT_CHECK_INTRO.md) | Short Check user guide |
| [`SHORT_CHECK_COMPLETE_DOCUMENTATION.md`](SHORT_CHECK_COMPLETE_DOCUMENTATION.md) | Long reference (may lag — trust code + Framework doc) |

## License

Private / as configured for this repository.
