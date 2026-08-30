# Forensic Report — project roadmap

Long-term program to augment Short Check with CELU-style **forensic dilution & supply** output, built on the existing scan stack — not a replacement for Fast Verdict, Short Check %, or Capital Pressure.

**North star:** A deterministic **Fact Pack** (Layer B) plus optional **LLM synthesis** (Layer C) and **PDF/UI render** (Layer D). The LLM never invents figures not in the pack; gaps get `VERIFY`.

**Claim tagging:** [`CLAIM_TAGGING.md`](CLAIM_TAGGING.md) — `VERIFY` / `CONFLICT` / `OPINION` codebase-wide.

---

## Architecture

```
Layer A — Deterministic collectors (existing + new modules)
  Fast Verdict · Short Check · Capital Pressure · Droppiness · Fundamentals · Filings
        │
        ▼
Layer B — ForensicFactPack (lib/forensic/buildFactPack.ts)
  TaggedClaim[] per section · conflict detection · snapshot table
        │
        ▼
Layer C — AI synthesis (lib/ai — extended thesis / future multi-pass)
  summary · thesis · regulatoryAlert · ceoLens · traderLens · forwardDates · dataGaps
        │
        ▼
Layer D — Render
  AiThesisCard UI · Copy Summary · Forensic Brief PDF (phased)
```

---

## ForensicFactPack schema (evolving)

Defined in `lib/forensic/types.ts`. Phase A ships a **subset**; later phases extend without breaking callers.

| Section | Phase | Source today |
|---------|-------|----------------|
| `meta` | A | ticker, asOf, packVersion |
| `alerts` | A | walk-aways, CP high status, borrow unavailable |
| `snapshot` | A | price, mkt cap, float, CP score, droppiness, fast verdict |
| `rubric` | A | DT badge rows from OCR |
| `capitalPressure` | A | score, events, top excerpts |
| `droppiness` | A | score, spikes, verdict |
| `compliance` | C | Nasdaq matrix (new module) |
| `shelfCapacity` | C | S-3/ATM roll-off, baby shelf |
| `instruments` | D | warrants, convertibles, supply-by-price |
| `ownership` | D | 13D/G, insider trades |
| `legal` | D | 10-K Item 3 timeline |
| `financingHistory` | C | normalized offering rows |
| `conflicts` | A+ | auto-detected CONFLICT rows |

---

## Phases

### Phase A — Forensic Brief v1 ✅ *shipped*

**Goal:** Extend AI Thesis with dual lens + alerts + tagging; fact pack in prompt.

| Deliverable | Status |
|-------------|--------|
| `lib/claims/*` tagging primitives | ✅ |
| `lib/forensic/buildFactPack.ts` | ✅ |
| Extended `AiThesisResult` JSON schema | ✅ |
| `AiThesisCard` — regulatory alert, rubric narrative, CEO/trader lens, data gaps | ✅ |
| `TaggedText` component | ✅ |
| `docs/CLAIM_TAGGING.md`, this roadmap | ✅ |
| `scripts/verify-claims.ts` | ✅ |

**Not in A:** PDF export, new SEC parsers, charts.

**Success:** Generate on a scanned ticker; output cites fact pack; `VERIFY` on thin data; no trade authorization language.

---

### Phase B — Forensic Brief PDF (1–2 weeks)

- HTML/PDF template mirroring sections 1, 5, 11–12 (snapshot, cash/runway narrative, radar, synthesis)
- Reuse `generateFormattedSummary` / export-pdf route
- Fact pack as single source for copy

---

### Phase C — Compliance & shelf module (3–4 weeks)

- `lib/forensic/nasdaqCompliance.ts` — deficiency notices, cure deadlines from CP events + 8-K patterns
- `lib/forensic/shelfCapacity.ts` — S-3 effective/lapsed, ATM status, baby-shelf I.B.6
- Normalized `financingHistory[]` from CP events
- Fact pack sections: `compliance`, `shelfCapacity`, `financingHistory`

---

### Phase D — Instrument-level supply (2–3 months)

- Warrant/convertible inventory (Ask Edgar integration or SEC XML)
- 13D/G ownership slice
- Form 4 direction parsing (replace stub)
- Supply-by-price map data (chart in Layer D)
- Fact pack: `instruments`, `ownership`

---

### Phase E — Full dossier parity (~4–6 months)

- 10-K Item 3 legal miner
- Price DB + raise-timing percentiles
- Multi-pass verify pass (extract → check → synthesize)
- 13-page PDF with charts, tables, section numbers
- Report versioning (`v3 RE-RUN` style) in KV

---

## Dependencies

| Dependency | Phases |
|------------|--------|
| `GROQ_API_KEY` | A+ |
| KV (thesis cache) | A |
| Capital Pressure events | A, C |
| Ask Edgar / external float | D (optional) |
| Extended SEC fetch budget | C, D |

---

## Out of scope (explicit)

- Sentiment / StockTwits in forensic synthesis (trading style)
- Replacing Framework 3.0 Fast Verdict
- Single-shot 13-page LLM without fact pack
- Investment advice or trade authorization language

---

## Related docs

- [`AI_THESIS.md`](AI_THESIS.md) — current API and prompt tuning
- [`CAPITAL_PRESSURE.md`](CAPITAL_PRESSURE.md) — SEC evidence module
- [`framework/Short-Selling-Framework-3.0.md`](framework/Short-Selling-Framework-3.0.md) — precedence order
