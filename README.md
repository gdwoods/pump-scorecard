# Pump Scorecard

Evidence-based risk analysis for microcap and OTC equities. Surfaces structural, volume, float, dilution, and capital-pressure signals from public market data and SEC EDGAR filings.

## What's included

| Surface | Description |
|---------|-------------|
| **Pump Scorecard** | Full multi-factor scan (`/scan/[ticker]`) with Filings, Capital Pressure, volume, float, and more |
| **Short Check** | Focused short-setup analysis (`/short-check/[ticker]`) with Risk Synopsis, Dilution Timeline, Capital Pressure, and Social Sentiment |
| **API** | `GET /api/scan/[ticker]` returns structured JSON including optional `capitalPressure` |

## Capital Pressure

Standalone research module that answers:

1. Does this ticker show near-term need to raise capital?
2. Is there a documented mechanism to issue common stock or equivalents?

It is a **research signal**, not a short label and not proof of dilution.

| Item | Detail |
|------|--------|
| Lookback | **12 months** for events; **24 months** only for S-1/S-3/F-1/F-3 registration capacity |
| Overall score | **Not** included in deprecated `weightedRiskScore` (use CP card + Short Check instead) |
| Docs | [`docs/CAPITAL_PRESSURE.md`](docs/CAPITAL_PRESSURE.md) |
| Code | `lib/capitalPressure/`, `lib/capitalPressureScoring.ts`, `components/CapitalPressureCard.tsx` |

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

Copy `.env.example` if present, or set:

| Variable | Purpose |
|----------|---------|
| `FMP_API_KEY` | Financial Modeling Prep (quotes, fundamentals) |
| `POLYGON_API_KEY` | Optional market data |
| `ALPHA_VANTAGE_API_KEY` | Optional |
| `GROQ_API_KEY` | AI thesis synthesis (server-side) |
| `AI_THESIS_RATE_LIMIT_WHITELIST` | Comma-separated IPs bypassing thesis rate limit |
| `DROPPINESS_WATCHLIST` | Tickers for nightly droppiness cron seeding (comma-separated) |
| `CRON_SECRET` | Auth for `/api/cron/droppiness` manual triggers |

## Scripts

```bash
npm run dev          # development server
npm run build        # production build
npm run start        # serve production build
npm run lint         # ESLint
npm run verify       # Run all tsx verification scripts (npx tsx if needed)
```

## Project layout

```
app/
  scan/[ticker]/          # Pump Scorecard page
  short-check/[ticker]/   # Short Check page
  api/scan/[ticker]/      # Scan API
components/
  CapitalPressureCard.tsx
  FilingsCard.tsx
  ...
lib/
  capitalPressure/         # types, EDGAR, parse, run, scoring bridge
  capitalPressureScoring.ts
  config/features.ts       # INCLUDE_CAPITAL_PRESSURE_IN_OVERALL_SCORE
  filings/                 # existing filings pipeline
docs/
  CAPITAL_PRESSURE.md      # full Capital Pressure documentation
__tests__/
  capitalPressure.test.ts
  fixtures/capitalPressure/
```

## Scoring notes

- Live Pump Scorecard / Short Check scoring is computed in the scan route and client layers (not a single `utils/scoring.ts` monolith).
- Capital Pressure has its own 0–100 score plus 0–10 `dilutionLikelihood` and `shortExecutionRisk`.
- Failed SEC fetch → neutral unavailable object (never high-risk by default).
- Capacity (S-3/ATM shelf) is distinct from issuance (SPA/ELOC draw, warrant exercise, etc.).

## Related docs

- [`docs/CAPITAL_PRESSURE.md`](docs/CAPITAL_PRESSURE.md) — Capital Pressure module
- [`SHORT_CHECK_INTRO.md`](SHORT_CHECK_INTRO.md) — Short Check overview
- [`SHORT_CHECK_COMPLETE_DOCUMENTATION.md`](SHORT_CHECK_COMPLETE_DOCUMENTATION.md) — Full Short Check reference

## License

Private / as configured for this repository.
