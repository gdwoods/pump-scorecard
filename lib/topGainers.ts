/** Polygon snapshot gainers + optional Ask Edgar dilution (server-side). */

import { acquireAskEdgarRequestSlot } from "@/lib/askEdgarThrottle";

/** Minimum % change vs prior close (Polygon) or premarket % (TradingView fallback). */
export const TOP_GAINERS_MIN_CHANGE_PCT = 20;

/** Match common US symbols (no dots/warrants) — same idea as Top Gainers monitor reference. */
const US_TICKER_RE = /^[A-Z]{2,4}$/;

export type AskEdgarDilutionSummary = {
  overallOfferingRisk: string | null;
};

export type TopGainerRow = {
  ticker: string;
  changePct: number | null;
  changeAbs: number | null;
  price: number | null;
  volume: number | null;
  askEdgar: AskEdgarDilutionSummary | null;
};

const DILUTION_RATING_ENTERPRISE =
  "https://eapi.askedgar.io/enterprise/v1/dilution-rating";
const DILUTION_RATING_V1 =
  "https://eapi.askedgar.io/v1/dilution-rating";

/** Env names checked in order (Vercel: exact spelling, Production checked, redeploy after add). */
export const ASKEDGAR_ENV_KEYS = [
  "ASKEDGAR_API_KEY",
  "ASK_EDGAR_API_KEY",
  "ASKEDGAR_KEY",
  "ASK_EDGAR_KEY",
] as const;

function cleanSecret(raw: string | undefined): string {
  if (!raw) return "";
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\r\n/g, "\n").trim();
}

/**
 * Server-only: reads common env names.
 * Important: use static `process.env.FOO` access only. Dynamic `process.env[name]`
 * is often stripped by the Next.js bundler, so variables set in Vercel never appear
 * at runtime (while POLYGON_API_KEY etc. still work).
 */
export function getAskEdgarApiKeyFromEnv(): string {
  return (
    cleanSecret(process.env.ASKEDGAR_API_KEY) ||
    cleanSecret(process.env.ASK_EDGAR_API_KEY) ||
    cleanSecret(process.env.ASKEDGAR_KEY) ||
    cleanSecret(process.env.ASK_EDGAR_KEY) ||
    ""
  );
}

function extractOverallRisk(record: Record<string, unknown>): string | null {
  const raw =
    record.overall_offering_risk ??
    record.OverallOfferingRisk ??
    record.overallOfferingRisk;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

function parseDilutionRatingJson(data: unknown): AskEdgarDilutionSummary | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const status = String(o.status || "").toLowerCase();
  if (status !== "success" && status !== "ok") return null;

  const results = o.results;
  if (!Array.isArray(results) || results.length === 0) return null;

  const first = results[0];
  if (!first || typeof first !== "object") return null;

  const risk = extractOverallRisk(first as Record<string, unknown>);
  return risk ? { overallOfferingRisk: risk } : null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export function normalizePolygonGainer(raw: Record<string, unknown>): TopGainerRow | null {
  const sym = typeof raw.ticker === "string" ? raw.ticker.trim().toUpperCase() : "";
  if (!sym) return null;

  const lastTrade = raw.lastTrade as { p?: number } | undefined;
  const min = raw.min as { c?: number; v?: number } | undefined;
  const day = raw.day as { c?: number; v?: number } | undefined;

  const price =
    (typeof lastTrade?.p === "number" ? lastTrade.p : null) ??
    (typeof min?.c === "number" ? min.c : null) ??
    (typeof day?.c === "number" ? day.c : null) ??
    null;

  const volume =
    (typeof day?.v === "number" ? day.v : null) ??
    (typeof min?.v === "number" ? min.v : null) ??
    null;

  const changePct =
    typeof raw.todaysChangePerc === "number" ? raw.todaysChangePerc : null;
  const changeAbs =
    typeof raw.todaysChange === "number" ? raw.todaysChange : null;

  return {
    ticker: sym,
    changePct,
    changeAbs,
    price,
    volume,
    askEdgar: null,
  };
}

export async function fetchPolygonGainers(
  apiKey: string,
  includeOtc: boolean
): Promise<TopGainerRow[]> {
  const u = new URL(
    "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/gainers"
  );
  u.searchParams.set("apiKey", apiKey);
  if (includeOtc) u.searchParams.set("include_otc", "true");

  const res = await fetch(u.toString(), { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Polygon gainers ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    status?: string;
    tickers?: Record<string, unknown>[];
  };

  const status = (data.status || "").toLowerCase();
  if (status && status !== "ok") {
    throw new Error(`Polygon gainers status: ${data.status}`);
  }

  const list = Array.isArray(data.tickers) ? data.tickers : [];
  const rows: TopGainerRow[] = [];
  for (const item of list) {
    const row = normalizePolygonGainer(item as Record<string, unknown>);
    if (!row) continue;
    if (
      row.changePct == null ||
      !Number.isFinite(row.changePct) ||
      row.changePct < TOP_GAINERS_MIN_CHANGE_PCT
    ) {
      continue;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * When Polygon's official movers snapshot is empty (overnight, before venues report, etc.),
 * TradingView's public scanner still returns ranked movers. Unofficial; use as fallback only.
 */
export async function fetchTradingViewGainersFallback(): Promise<TopGainerRow[]> {
  const resp = await fetch("https://scanner.tradingview.com/america/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      markets: ["america"],
      symbols: { query: { types: ["stock"] }, tickers: [] },
      options: { lang: "en" },
      columns: [
        "name",
        "close",
        "premarket_change",
        "premarket_change_abs",
        "premarket_close",
        "premarket_volume",
        "volume",
        "market_cap_basic",
      ],
      sort: { sortBy: "premarket_change", sortOrder: "desc" },
      range: [0, 150],
    }),
    cache: "no-store",
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`TradingView scanner ${resp.status}: ${t.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    data?: Array<{ d?: unknown[] }>;
  };

  const rows: TopGainerRow[] = [];
  for (const row of data.data || []) {
    const d = row.d;
    if (!Array.isArray(d) || d.length < 8) continue;

    const sym = typeof d[0] === "string" ? d[0].trim().toUpperCase() : "";
    if (!US_TICKER_RE.test(sym)) continue;

    const pct = typeof d[2] === "number" ? d[2] : Number(d[2]);
    if (!Number.isFinite(pct) || pct < TOP_GAINERS_MIN_CHANGE_PCT) continue;

    const preClose = typeof d[4] === "number" ? d[4] : null;
    const regClose = typeof d[1] === "number" ? d[1] : null;
    const price = preClose ?? regClose ?? null;

    const pmVol = typeof d[5] === "number" ? d[5] : null;
    const regVol = typeof d[6] === "number" ? d[6] : null;
    const volume = pmVol ?? regVol ?? null;

    const changeAbs =
      typeof d[3] === "number" ? d[3] : Number.isFinite(Number(d[3])) ? Number(d[3]) : null;

    rows.push({
      ticker: sym,
      changePct: pct,
      changeAbs,
      price,
      volume,
      askEdgar: null,
    });
  }

  rows.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  return rows.slice(0, 30);
}

export async function fetchAskEdgarDilutionSummary(
  apiKey: string,
  ticker: string
): Promise<AskEdgarDilutionSummary | null> {
  const sym = ticker.trim().toUpperCase();
  if (!sym) return null;

  const qs = new URLSearchParams({
    ticker: sym,
    offset: "0",
    limit: "10",
  }).toString();

  const headers = {
    "API-KEY": apiKey,
    "Content-Type": "application/json",
  };

  for (const base of [DILUTION_RATING_ENTERPRISE, DILUTION_RATING_V1]) {
    try {
      await acquireAskEdgarRequestSlot();
      const res = await fetchWithTimeout(
        `${base}?${qs}`,
        { method: "GET", headers },
        12_000
      );

      if (!res.ok) continue;

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        continue;
      }

      const parsed = parseDilutionRatingJson(data);
      if (parsed) return parsed;
    } catch {
      /* network / abort */
    }
  }

  return null;
}

const ENRICH_LIMIT = 20;
const ENRICH_CONCURRENCY = 4;

export async function enrichRowsWithAskEdgar(
  rows: TopGainerRow[],
  apiKey: string
): Promise<TopGainerRow[]> {
  const head = rows.slice(0, ENRICH_LIMIT);
  const tail = rows.slice(ENRICH_LIMIT).map((r) => ({ ...r, askEdgar: null }));

  const enriched: TopGainerRow[] = [];
  for (let i = 0; i < head.length; i += ENRICH_CONCURRENCY) {
    const chunk = head.slice(i, i + ENRICH_CONCURRENCY);
    const part = await Promise.all(
      chunk.map(async (row) => {
        try {
          const askEdgar = await fetchAskEdgarDilutionSummary(apiKey, row.ticker);
          return { ...row, askEdgar };
        } catch {
          return { ...row, askEdgar: null };
        }
      })
    );
    enriched.push(...part);
  }

  return [...enriched, ...tail];
}
