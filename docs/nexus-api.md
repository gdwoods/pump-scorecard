# Operating nexus API (partner integration)

Short Check exposes a read-only JSON endpoint for **operating nexus**: US-listed issuers whose latest **10-K / 20-F / 40-F** (or 10-Q fallback) and **DEF 14A** tie real operations or control to jurisdictions beyond the SEC business address (e.g. Taiwan operations, Cayman control).

This is **not** the same as the SEC address “country” field. Use both: address for domicile, nexus for filing-based ops/control.

---

## Endpoint

```
GET https://short-check.vercel.app/api/nexus/{TICKER}
```

Optional query:

- `refresh=1` — bypass KV and re-fetch from SEC (use sparingly; counts against daily API limit).

### Authentication

Send a shared secret on every request:

```
x-api-key: YOUR_NEXUS_API_KEY
```

(`Authorization: Bearer YOUR_NEXUS_API_KEY` is also accepted.)

Garth creates the key in Vercel as `NEXUS_API_KEY` and shares the value with the partner only.

### Example

```bash
curl -sS \
  -H "x-api-key: $NEXUS_API_KEY" \
  "https://short-check.vercel.app/api/nexus/AIMD"
```

---

## Response shape

```json
{
  "ticker": "AIMD",
  "overseas": true,
  "countries": ["Taiwan", "Cayman Islands"],
  "reason": "Listed in the US. Filings tie operations or control to Taiwan and the Cayman Islands.",
  "evidenceUrl": "https://www.sec.gov/Archives/edgar/data/...",
  "asOf": "2026-11-10",
  "status": "flagged"
}
```

### `status` values

| status | Meaning |
|--------|---------|
| `flagged` | Nexus hit — show `overseas: true` and `countries` |
| `clear` | US-listed, filings reviewed, no nexus detected |
| `not_applicable` | Non–US-domicile on SEC address — keep using address country only |
| `unknown` | SEC or filing fetch failed — show neutral UI, retry later |

### HTTP codes

| Code | Meaning |
|------|---------|
| 200 | Success (check `status` inside JSON) |
| 400 | Invalid ticker |
| 401 | Missing or wrong API key |
| 429 | Daily per-key limit (`NEXUS_RATE_LIMIT_PER_DAY`) |
| 503 | API not configured (`NEXUS_API_KEY` missing on server) |

---

## Caching (recommended for clients)

1. **Cache per ticker for 24 hours** in the partner app (memory or local storage). Filings change quarterly at most.
2. Responses include CDN cache headers (`s-maxage=3600`); repeated calls within an hour may be served from the edge.
3. Server-side results are stored in **Vercel KV** with a **180-day TTL** (about six months), keyed by ticker **and** the latest annual + proxy filing dates so a new 10-K or DEF 14A automatically invalidates stale entries.
4. Do **not** call the API on every table scroll — batch gainers once per session or use a server-side aggregator.

---

## UI hints

When `status === "flagged"`, you can surface `countries` and `reason` in a tooltip (e.g. overseas operating nexus). Optionally link to `evidenceUrl` for the primary SEC filing.

---

## Background warming

A daily cron (`/api/cron/nexus-warm`) pre-computes a small batch of tickers from:

- `NEXUS_PARTNER_TICKERS` (comma-separated watchlist)
- tickers already in Short Check’s nexus/droppiness universe

Partners can ask Garth to seed their daily gainer list into `NEXUS_PARTNER_TICKERS` so hot symbols are usually instant KV hits.

---

## Support

Contact Garth for API key rotation, higher daily limits, or watchlist updates.