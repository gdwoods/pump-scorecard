# AI Thesis

On-demand LLM synthesis that turns scan data you already have into a plain-English short thesis. It appears on **Short Check** and **Fast Scan** via `AiThesisCard`.

**Not trade authorization.** Framework 3.0 precedence: vetoes and walk-away flags bind; the AI thesis is the **lowest-precedence** input.

---

## Architecture

```
Browser (AiThesisCard)
  │  POST /api/ai-thesis  { ticker, fastVerdict?, shortCheck?, extractedData?, scan? }
  ▼
app/api/ai-thesis/route.ts
  ├─ SHOW_AI_THESIS feature flag
  ├─ GROQ_API_KEY check
  ├─ per-IP rate limit (lib/ai/rateLimit.ts)
  ├─ KV cache lookup (lib/ai/thesisCache.ts) — 24h TTL
  ├─ buildThesisMessages() (lib/ai/buildThesisPrompt.ts)
  ├─ callGroq() (lib/ai/groqClient.ts)
  └─ parseThesisContent() (lib/ai/parseThesisContent.ts)
```

The route **never re-fetches** SEC, Yahoo, or Polygon. The client sends whatever it already loaded from Short Check, Fast Verdict, and `/api/scan/[ticker]`. If none of `shortCheck`, `scan`, `extractedData`, or `fastVerdict` is present, the API returns 400.

`GET /api/ai-thesis` returns `{ enabled, configured }` so the UI can hide or show a “missing key” message without exposing secrets.

---

## Where it appears

| Surface | When thesis is available |
|---------|--------------------------|
| **Short Check** | After DT analyze + ticker scan (or Quick Ticker with Fast Verdict + scan) |
| **Fast Scan** | After Fast Verdict + scan data load |

Toggle globally: `SHOW_AI_THESIS` in `lib/config/features.ts`.

---

## Prompt tuning

### System prompt (primary knob)

Edit `SYSTEM_PROMPT` in `lib/ai/buildThesisPrompt.ts`.

Current rules encoded in the prompt:

- Lowest precedence in Framework 3.0 — synthesis only, never “take this trade”
- Walk-away flags and vetoes are **binding** — explain, do not argue around
- Ground every claim in supplied data; do not invent figures or filings
- Judge catalyst **significance** and **recency** (high / moderate / low / stale)
- Respond with **strict JSON** (no markdown fences)

The constant is exported as `SYSTEM_PROMPT` for tests. Claim tagging rules (`VERIFY:`, `CONFLICT:`, `OPINION:`) are documented in [`CLAIM_TAGGING.md`](CLAIM_TAGGING.md).

### Forensic Fact Pack (Layer B)

Before the scan sections, `buildThesisMessages()` assembles a deterministic **Forensic Fact Pack** via `lib/forensic/buildFactPack.ts`:

- Binding alerts from walk-aways, high CP, baby-shelf flags
- Auto-detected **CONFLICT** when DT float vs scan float diverge ≥15%
- **Data gaps** when completeness is low, insider direction is unparsed, or CP is missing
- Snapshot (price, cap, float, droppiness, CP score, verdicts)
- Rubric rows from DT badges and Short Check `actualValues`

The pack is injected at the top of the user message. The model must not invent beyond it. Full forensic report program: [`FORENSIC_REPORT_ROADMAP.md`](FORENSIC_REPORT_ROADMAP.md).

### User message (data assembly)

`buildThesisMessages(input)` builds the user turn from optional sections:

| Section | Source | Contents |
|---------|--------|----------|
| Fast Verdict | `input.fastVerdict` | Verdict, binding flags, runner class, droppiness, news class, **borrow availability/fee**, **data completeness**, baby-shelf, offering ability |
| Short Check | `input.shortCheck` | Rating %, category, **data completeness**, walk-aways, alert labels, `actualValues` from score breakdown |
| DT / manual | `input.extractedData` | Offering badge, price, spike %, news catalyst |
| Scan | `input.scan` | **Droppiness spike history** (top 3 by magnitude), Capital Pressure score + **SEC filing excerpts** (top 3 weighted reasons), news (up to 8), insider filing count (direction not parsed), **fundamentals** (price, cap, float); legacy `weightedRiskScore` labeled deprecated |

To change **what data** the model sees, edit `buildThesisMessages()` and/or `fastVerdictToPromptSlice()` in `lib/ai/fastVerdictPrompt.ts`.

To change **how** sections are formatted, edit the `format*` helpers in `buildThesisPrompt.ts`.

### Model and sampling

| Knob | Location | Default |
|------|----------|---------|
| Model | `GROQ_MODEL` env | `openai/gpt-oss-120b` |
| Temperature | `callGroq()` in `lib/ai/groqClient.ts` | `0.3` |
| Max tokens | `callGroq()` in route | `1200` (extended forensic brief) |
| JSON mode | `response_format: { type: 'json_object' }` | always on |

Get a Groq key at https://console.groq.com/keys. Set `GROQ_API_KEY` server-side only (see `VERCEL_ENV_SETUP.md`).

---

## Request / response schema

### Request (`ThesisPromptInput`)

Defined in `lib/ai/types.ts`. Minimum: `{ "ticker": "ABCD" }` plus at least one data section.

```typescript
{
  ticker: string;
  now?: string;                    // ISO "as of" for recency (tests inject fixed value)
  fastVerdict?: FastVerdictPromptSlice;
  shortCheck?: {
    rating: number;
    category: string;
    walkAwayFlags: string[];
    alertLabels: Array<{ label: string; color: string }>;
    actualValues?: Record<string, string | undefined>;
    dataCompleteness?: number;     // 0–1
  };
  extractedData?: { ...; float?: number };
  scan?: {
    ...
    fundamentals?: { price?, marketCap?, floatShares?, sharesOutstanding?, institutionalOwnership?, shortFloat? };
  };
  fastVerdict?: {
    ...
    borrowAvailable: boolean | null;
    borrowFeePct: number | null;
    dataCompleteness: number;
  };
```

### Groq output (parsed)

The model must return JSON matching this shape (enforced by prompt + `parseThesisContent`):

```json
{
  "summary": "2-3 sentence at-a-glance",
  "thesis": "one or two paragraphs (prefix uncertain lines VERIFY:/CONFLICT:/OPINION:)",
  "regulatoryAlert": "optional one-line alert or empty string",
  "rubricNarrative": "optional DT/score ↔ SEC tie-in or empty string",
  "ceoLens": "optional issuer financing/compliance paragraph",
  "traderLens": "optional setup mechanics paragraph",
  "catalysts": [
    {
      "description": "string",
      "date": "optional string",
      "significance": "high|moderate|low|stale",
      "rationale": "why this significance"
    }
  ],
  "forwardDates": [
    { "date": "string", "event": "string", "significance": "high|moderate|low|stale", "tag": "verify|conflict|opinion" }
  ],
  "dataGaps": ["VERIFY-prefixed missing data items"],
  "keyRisks": ["what could invalidate the thesis"]
}
```

After parsing, the API adds `model`, `generatedAt`, and `reportVersion` (`forensic-brief-v1`) → `AiThesisResult`.

UI renders inline tags via `components/claims/TaggedText.tsx`. See [`CLAIM_TAGGING.md`](CLAIM_TAGGING.md).

After generation, **Copy Brief** (clipboard) and **Export PDF** buttons appear on `AiThesisCard`. Both use the deterministic fact pack + cached thesis — no second Groq call.

---

## Forensic Brief export (Phase B)

```
AiThesisCard (after thesis generated)
  ├─ Copy Brief → buildForensicFactPack(input) + formatBriefPlainText()  (client)
  └─ Export PDF → POST /api/forensic-brief/export-pdf { input, thesis }
                    └─ buildForensicFactPack() + renderForensicBriefPdf()
```

| Endpoint | Body | Response |
|----------|------|----------|
| `POST /api/forensic-brief/export-pdf` | `{ input: ThesisPromptInput, thesis: AiThesisResult }` | PDF attachment |

Sections: snapshot, alerts, conflicts, rubric, SEC notes, regulatory alert, summary/thesis, lenses, catalysts, forward dates, data gaps, key risks. VERIFY/CONFLICT/OPINION tags render as `[TAG] body` in export.

Verify: `npx tsx scripts/verify-forensic-brief.ts`

Invalid catalysts are **dropped** (not a hard fail). Missing `summary` or `thesis` → entire response rejected.

### API responses

| Case | Body |
|------|------|
| Success (fresh) | `{ success: true, thesis: AiThesisResult }` |
| Success (cached) | `{ success: true, thesis: AiThesisResult, cached: true }` |
| Disabled / no key | `{ success: false, error: "..." }` with HTTP 200 |
| Rate limited | `{ success: false, error: "..." }` with HTTP 429 |
| Bad input | HTTP 400 |

---

## Caching

`lib/ai/thesisCache.ts` stores results in Vercel/Upstash KV.

| Item | Value |
|------|-------|
| Exact key | `ai-thesis:{TICKER}:{sha256(payload).slice(0,32)}` |
| Shared ticker key | `ai-thesis:latest:{TICKER}` — same thesis for all users on that symbol |
| Payload hashed (exact key) | `{ ticker, shortCheck, extractedData, scan, fastVerdict }` |
| TTL | 24 hours |

Lookup order: exact payload match → ticker latest. API returns `sharedCache: true` when serving the ticker-level entry.

Same ticker with **different** scan data may still get the shared ticker cache (by design for group use). Changing the system prompt does **not** invalidate cache — wait for TTL or clear KV keys manually when testing prompt changes.

Requires KV env vars (`KV_REST_API_*`). Without KV, cache reads return null and every request hits Groq.

---

## Rate limiting

`lib/ai/rateLimit.ts`: **10 requests per IP per hour** by default (rolling window via KV `INCR` + `EXPIRE`).

| Env | Purpose |
|-----|---------|
| `AI_THESIS_RATE_LIMIT_WHITELIST` | Comma-separated IPs that bypass the cap |
| `AI_THESIS_RATE_LIMIT_PER_HOUR` | Per-IP cap (default `10`; use `3`–`5` for a shared trading group) |

When KV is unavailable (local dev), an in-memory fallback bucket is used.

### Shared Groq budget (all users)

Per-IP limits do **not** protect Groq quota — every user shares one `GROQ_API_KEY` and one Groq org limit (~1k RPD / 200k TPD on free tier; **8k TPM** is often the first bottleneck).

| Env | Purpose |
|-----|---------|
| `AI_THESIS_DAILY_GROQ_BUDGET` | Max Groq API calls per UTC day for the whole app (default `50`) |

When the budget is exhausted, the API returns a clear message before calling Groq. Cached theses (exact or per-ticker) still work with **zero** Groq calls.

Groq itself also rate-limits. The client surfaces Groq 429s as a friendly error.

---

## Group / trading-desk usage

Realistic free-tier capacity (with defaults):

| Layer | What it protects |
|-------|------------------|
| Per-IP limit | One member spamming Generate |
| Ticker cache (`ai-thesis:latest:{TICKER}`) | Second member on same symbol gets instant cached thesis |
| Daily Groq budget | Whole group from silently burning org quota |

**Example:** 8 traders × 5 tickers/day = 40 unique symbols → ~40–80 Groq calls if everyone hits fresh tickers. Same symbols shared via ticker cache → ~5–10 Groq calls.

For heavier use, upgrade Groq to the **Developer plan** (pay-as-you-go, higher TPM/RPM) and raise `AI_THESIS_DAILY_GROQ_BUDGET` accordingly.

---

## File map

| File | Role |
|------|------|
| `lib/ai/buildThesisPrompt.ts` | **System prompt + user message builder** |
| `lib/ai/fastVerdictPrompt.ts` | Fast Verdict → prompt slice |
| `lib/ai/groqClient.ts` | Groq HTTP client |
| `lib/ai/parseThesisContent.ts` | JSON validation / normalization |
| `lib/ai/thesisCache.ts` | KV read/write (exact + per-ticker shared) |
| `lib/ai/groqBudget.ts` | Shared daily Groq call cap |
| `lib/ai/rateLimit.ts` | Per-IP limit |
| `lib/ai/types.ts` | TypeScript types |
| `app/api/ai-thesis/route.ts` | API route |
| `components/AiThesisCard.tsx` | UI card + Copy Brief / Export PDF |
| `lib/forensic/formatBriefForExport.ts` | Plain-text brief sections |
| `lib/forensic/renderForensicBriefPdf.ts` | PDF renderer |
| `app/api/forensic-brief/export-pdf/route.ts` | Forensic brief PDF API |
| `lib/config/features.ts` | `SHOW_AI_THESIS` flag |
| `scripts/verify-ai-thesis.ts` | Offline verification |
| `scripts/verify-forensic-brief.ts` | Brief PDF/plain-text verification |

---

## Verification

```bash
npx tsx scripts/verify-ai-thesis.ts
# or
npm run verify   # runs all verify-* scripts
```

Covers prompt building, JSON parsing, rate limit, and Groq plumbing **without** a live API key.

---

## Tuning workflow (recommended)

1. Edit `SYSTEM_PROMPT` and/or `buildThesisMessages()` in `lib/ai/buildThesisPrompt.ts`.
2. Run `npx tsx scripts/verify-ai-thesis.ts`.
3. Test locally with `GROQ_API_KEY` set — use a ticker you know well.
4. Remember cache: change input data slightly or wait 24h to see prompt-only changes on the same payload.
5. Deploy; confirm `GET /api/ai-thesis` returns `{ enabled: true, configured: true }` on production.

---

## Related docs

- [`docs/framework/Short-Selling-Framework-3.0.md`](framework/Short-Selling-Framework-3.0.md) — precedence order the prompt references
- [`docs/CAPITAL_PRESSURE.md`](CAPITAL_PRESSURE.md) — CP fields sent in `scan.capitalPressure`
- [`VERCEL_ENV_SETUP.md`](../VERCEL_ENV_SETUP.md) — `GROQ_API_KEY` and KV setup
