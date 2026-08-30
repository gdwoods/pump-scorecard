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

The constant is exported as `SYSTEM_PROMPT` for tests.

### User message (data assembly)

`buildThesisMessages(input)` builds the user turn from optional sections:

| Section | Source | Contents |
|---------|--------|----------|
| Fast Verdict | `input.fastVerdict` | Verdict, binding flags, runner class, droppiness, news class, **borrow availability/fee**, **data completeness**, baby-shelf, offering ability |
| Short Check | `input.shortCheck` | Rating %, category, **data completeness**, walk-aways, alert labels, `actualValues` from score breakdown |
| DT / manual | `input.extractedData` | Offering badge, price, spike %, news catalyst |
| Scan | `input.scan` | **Droppiness spike history** (top 3 by magnitude), Capital Pressure score + **SEC filing excerpts** (top 3 weighted reasons), news (up to 8), insider filing count (direction not parsed); legacy `weightedRiskScore` labeled deprecated |

To change **what data** the model sees, edit `buildThesisMessages()` and/or `fastVerdictToPromptSlice()` in `lib/ai/fastVerdictPrompt.ts`.

To change **how** sections are formatted, edit the `format*` helpers in `buildThesisPrompt.ts`.

### Model and sampling

| Knob | Location | Default |
|------|----------|---------|
| Model | `GROQ_MODEL` env | `openai/gpt-oss-120b` |
| Temperature | `callGroq()` in `lib/ai/groqClient.ts` | `0.3` |
| Max tokens | `callGroq()` | `900` |
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
  extractedData?: { ... };
  scan?: {
    weightedRiskScore?: number;
    summaryVerdict?: string;
    droppinessVerdict?: string;
    droppinessScore?: number;
    droppinessDetail?: Array<{ date: string; spikePct: number; retraced: boolean }>;
    capitalPressure?: {
      score: number;
      status: string;
      summary: string;
      reasons?: Array<{ label: string; points: number; evidence?: { form, filingDate, excerpt, ... } }>;
      events?: Array<{ eventDate, type, title, evidence? }>;
    };
    news?: Array<{ title?, headline?, date?, published? }>;
    insiderTransactionsCount?: number;
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
  "thesis": "one or two paragraphs",
  "catalysts": [
    {
      "description": "string",
      "date": "optional string",
      "significance": "high|moderate|low|stale",
      "rationale": "why this significance"
    }
  ],
  "keyRisks": ["what could invalidate the thesis"]
}
```

After parsing, the API adds `model` and `generatedAt` → `AiThesisResult`.

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
| Key prefix | `ai-thesis:` |
| Key format | `ai-thesis:{TICKER}:{sha256(payload).slice(0,32)}` |
| Payload hashed | `{ ticker, shortCheck, extractedData, scan, fastVerdict }` |
| TTL | 24 hours |

Same ticker with **different** scan/Short Check data gets a different cache key. Changing the system prompt does **not** invalidate cache — wait for TTL or clear KV keys manually when testing prompt changes.

Requires KV env vars (`KV_REST_API_*`). Without KV, cache reads return null and every request hits Groq.

---

## Rate limiting

`lib/ai/rateLimit.ts`: **10 requests per IP per hour** (rolling window via KV `INCR` + `EXPIRE`).

| Env | Purpose |
|-----|---------|
| `AI_THESIS_RATE_LIMIT_WHITELIST` | Comma-separated IPs that bypass the cap |

When KV is unavailable (local dev), an in-memory fallback bucket is used.

Groq itself also rate-limits (~30 RPM / ~1k RPD on free tier as of writing). The client surfaces Groq 429s as a friendly error.

---

## File map

| File | Role |
|------|------|
| `lib/ai/buildThesisPrompt.ts` | **System prompt + user message builder** |
| `lib/ai/fastVerdictPrompt.ts` | Fast Verdict → prompt slice |
| `lib/ai/groqClient.ts` | Groq HTTP client |
| `lib/ai/parseThesisContent.ts` | JSON validation / normalization |
| `lib/ai/thesisCache.ts` | KV read/write |
| `lib/ai/rateLimit.ts` | Per-IP limit |
| `lib/ai/types.ts` | TypeScript types |
| `app/api/ai-thesis/route.ts` | API route |
| `components/AiThesisCard.tsx` | UI card |
| `lib/config/features.ts` | `SHOW_AI_THESIS` flag |
| `scripts/verify-ai-thesis.ts` | Offline verification |

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
