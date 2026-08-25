# Capital Pressure (SEC evidence module)

Evidence-first research signal for **Short Check** and **Pump Scorecard**. It answers whether a ticker has both (1) near-term capital need and (2) a documented mechanism to issue common stock or common-stock equivalents.

It is **not** a trade recommendation and does **not** label a ticker a short. Dilution is never asserted as certain.

---

## Where it appears

- Pump Scorecard: full-width card after Filings
- Short Check: after Fundamentals / Filings; soft note under Risk Synopsis when scan data is present
- Short Check PDF + Copy Summary (when `pumpScorecardData` includes the module)

Optional field on `GET /api/scan/[ticker]`: `capitalPressure`. Existing clients ignore unknown keys.

**Overall Pump Scorecard weights are unchanged.** `INCLUDE_CAPITAL_PRESSURE_IN_OVERALL_SCORE` in `lib/config/features.ts` stays `false` until a deliberate weight experiment.

---

## Score meanings

| Field | Range | Meaning |
| --- | --- | --- |
| `score` | 0–100 | Documented capital / dilution pressure from SEC evidence |
| Status | Low / Watch / Elevated / High | Badge thresholds: 0–24 / 25–49 / 50–74 / 75–100 |
| `dilutionLikelihood` | 0–10 | Scaled from score (+1 bonus for recent confirmed draw / conversion / prospectus supplement within 30 days) |
| `shortExecutionRisk` | 0–10 | Separate: reverse split, missing float/borrow, high-impact news, Droppiness “spikes hold”. **Not** included in Pump overall score. Label: execution risk, not a bullish signal. |

Unverified criteria score **0** and appear in `unknowns`. Missing data never silently becomes a high-risk result.

---

## Supply fields (kept separate)

1. **Potential / registered capacity** — shelf, ATM program, equity line, warrant reserve (not shares already issued)
2. **Recently issued supply** — confirmed issued/sold shares (and proceeds) in 7 / 30 / 90 day windows
3. **Current share count** — latest reported outstanding shares when XBRL/filing evidence exists

Statuses: `reported` | `partial` | `unknown` | `not_applicable`. UI copy for unknown: **“Not verified from available filings”** (never “None”).

---

## Lookback window

| Scope | Window |
| --- | --- |
| Events (8-K, 6-K, 10-Q/10-K, 424B\*) | **12 months** |
| Registration statements (S-1/S-3/F-1/F-3) | **24 months** (shelves can remain effective) |

Scoring recency caps are shorter (e.g. ATM draw 30d, registered direct 90d, reverse split 180d). A flat 24-month event scan is not required for those rules.

---

## Evidence rules (conservative)

- Primary source: **SEC EDGAR** only (not headlines, social, promotions, or price)
- Phrase-gated parsing with nearby numeric/date context for high confidence
- `needs_review` events appear on the timeline but award **0** automatic points
- **Capacity ≠ issuance** — only call something issued when the filing says shares were issued/sold
- Selling-shareholder / resale SPA text is **not** company ATM/ELOC capacity
- Retrospective reverse-split footnotes are timeline-only (no +10)
- Going concern: explicit language in latest 10-Q/10-K only (not inferred from losses)

Every automatic score reason includes an SEC excerpt and document link.

---

## UI (research scanning)

- Compact default: score, short status, summary, strongest reason, 3 timeline events
- Expand: supply fields, sub-scores, full timeline, data gaps
- Timeline filters: All / Issued / Capacity / Needs review
- Copy top reason + SEC link
- Criteria coverage meter (`N/10` verified)
- Manual EDGAR link (CIK when available) if SEC is unavailable or in expanded details
- Short Check: soft “SEC evidence also shows…” under Risk Synopsis; amber footnote if DilutionTracker offering tags disagree with SEC Capital Pressure (**does not change Short Check scoring**)

---

## Code map

| Path | Role |
| --- | --- |
| `lib/capitalPressure/` | Types, EDGAR helpers, parser, runner, text clean, Short Check bridge |
| `lib/capitalPressureScoring.ts` | 0–100 score + sub-scores |
| `components/CapitalPressureCard.tsx` | UI card |
| `app/api/scan/[ticker]/route.ts` | Attaches optional `capitalPressure` |
| `__tests__/capitalPressure.test.ts` | Fixture-only unit tests (no live SEC) |
| `__tests__/fixtures/capitalPressure/` | Saved filing-text fixtures |

Run tests:

```bash
npm test -- __tests__/capitalPressure.test.ts
```

---

## Out of scope

- Real-time borrow/locate or trade execution automation
- Predicting a future offering
- Automatic short recommendations
- Treating social or price moves as issuance evidence
- Replacing Short Check OCR ATM/shelf scoring
