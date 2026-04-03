/**
 * Server-side Ask Edgar aggregates for the Dilution Monitor detail panel.
 * Endpoints mirror jasontange/Top-Gainers-Dilution-Monitor-V2-Public (das_monitor.py).
 */

import { acquireAskEdgarRequestSlot } from "@/lib/askEdgarThrottle";

const AE = {
  dilutionE: "https://eapi.askedgar.io/enterprise/v1/dilution-rating",
  dilutionV1: "https://eapi.askedgar.io/v1/dilution-rating",
  floatE: "https://eapi.askedgar.io/enterprise/v1/float-outstanding",
  newsE: "https://eapi.askedgar.io/enterprise/v1/news",
  dilDataE: "https://eapi.askedgar.io/enterprise/v1/dilution-data",
  screenerE: "https://eapi.askedgar.io/enterprise/v1/screener",
  chartV1: "https://eapi.askedgar.io/v1/ai-chart-analysis",
  offeringsV1: "https://eapi.askedgar.io/v1/offerings",
};

/** Optional: record upstream HTTP status for meta (429 / auth) and Vercel logs. */
export type AskEdgarHttpCtx = {
  saw429: boolean;
  saw401: boolean;
  maxStatus: number;
};

function bumpAeStatus(ctx: AskEdgarHttpCtx | undefined, status: number) {
  if (!ctx) return;
  ctx.maxStatus = Math.max(ctx.maxStatus, status);
  if (status === 429) ctx.saw429 = true;
  if (status === 401 || status === 403) ctx.saw401 = true;
}

async function aeGet(
  url: string,
  search: Record<string, string>,
  apiKey: string,
  ms = 14_000,
  ctx?: AskEdgarHttpCtx
): Promise<unknown | null> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(search)) u.searchParams.set(k, v);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    await acquireAskEdgarRequestSlot();
    const res = await fetch(u.toString(), {
      method: "GET",
      headers: { "API-KEY": apiKey, "Content-Type": "application/json" },
      signal: ac.signal,
      cache: "no-store",
    });
    bumpAeStatus(ctx, res.status);
    if (!res.ok) {
      if (res.status === 429)
        console.warn("[AskEdgar] 429", u.pathname, { ticker: search.ticker });
      else if (res.status === 401 || res.status === 403)
        console.warn("[AskEdgar] auth error", res.status, u.pathname);
      return null;
    }
    return await res.json();
  } catch {
    bumpAeStatus(ctx, 0);
    return null;
  } finally {
    clearTimeout(t);
  }
}

function aeSuccess(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const s = String((data as Record<string, unknown>).status || "").toLowerCase();
  return s === "success" || s === "ok";
}

function firstResult(data: unknown): Record<string, unknown> | null {
  if (!aeSuccess(data)) return null;
  const r = (data as Record<string, unknown>).results;
  if (!Array.isArray(r) || !r.length || typeof r[0] !== "object" || !r[0])
    return null;
  return r[0] as Record<string, unknown>;
}

export async function fetchDilutionRecord(
  apiKey: string,
  sym: string,
  ctx?: AskEdgarHttpCtx
): Promise<Record<string, unknown> | null> {
  for (const url of [AE.dilutionE, AE.dilutionV1]) {
    const data = await aeGet(
      url,
      { ticker: sym, offset: "0", limit: "10" },
      apiKey,
      14_000,
      ctx
    );
    const row = firstResult(data);
    if (row) return row;
  }
  return null;
}

export async function fetchFloatRecord(
  apiKey: string,
  sym: string,
  ctx?: AskEdgarHttpCtx
): Promise<Record<string, unknown> | null> {
  const data = await aeGet(
    AE.floatE,
    { ticker: sym, offset: "0", limit: "100" },
    apiKey,
    14_000,
    ctx
  );
  return firstResult(data);
}

export async function fetchNewsResults(
  apiKey: string,
  sym: string,
  ctx?: AskEdgarHttpCtx
): Promise<Record<string, unknown>[]> {
  const data = await aeGet(
    AE.newsE,
    { ticker: sym, offset: "0", limit: "100" },
    apiKey,
    14_000,
    ctx
  );
  if (!aeSuccess(data)) return [];
  const r = (data as Record<string, unknown>).results;
  return Array.isArray(r) ? (r as Record<string, unknown>[]) : [];
}

export async function fetchChartAnalysis(
  apiKey: string,
  sym: string,
  ctx?: AskEdgarHttpCtx
): Promise<Record<string, unknown> | null> {
  const data = await aeGet(
    AE.chartV1,
    { ticker: sym, limit: "1" },
    apiKey,
    14_000,
    ctx
  );
  return firstResult(data);
}

export async function fetchScreenerPrice(
  apiKey: string,
  sym: string,
  ctx?: AskEdgarHttpCtx
): Promise<number | null> {
  const data = await aeGet(AE.screenerE, { ticker: sym }, apiKey, 14_000, ctx);
  const row = firstResult(data);
  if (!row) return null;
  const p = row.price;
  return typeof p === "number" && Number.isFinite(p) ? p : null;
}

export async function fetchDilutionDataResults(
  apiKey: string,
  sym: string,
  ctx?: AskEdgarHttpCtx
): Promise<Record<string, unknown>[]> {
  const data = await aeGet(
    AE.dilDataE,
    { ticker: sym, offset: "0", limit: "40" },
    apiKey,
    14_000,
    ctx
  );
  if (!aeSuccess(data)) return [];
  const r = (data as Record<string, unknown>).results;
  return Array.isArray(r) ? (r as Record<string, unknown>[]) : [];
}

export async function fetchOfferings(
  apiKey: string,
  sym: string,
  ctx?: AskEdgarHttpCtx
): Promise<Record<string, unknown>[]> {
  const data = await aeGet(
    AE.offeringsV1,
    { ticker: sym, limit: "5" },
    apiKey,
    14_000,
    ctx
  );
  if (!aeSuccess(data)) return [];
  const r = (data as Record<string, unknown>).results;
  return Array.isArray(r) ? (r as Record<string, unknown>[]) : [];
}

/** Port of das_monitor.py fetch_in_play_dilution filtering. */
export function filterInPlayDilution(
  results: Record<string, unknown>[],
  stockPrice: number
): { warrants: Record<string, unknown>[]; convertibles: Record<string, unknown>[] } {
  const warrants: Record<string, unknown>[] = [];
  const convertibles: Record<string, unknown>[] = [];
  if (!stockPrice || stockPrice <= 0) return { warrants, convertibles };

  const maxPrice = stockPrice * 4;
  const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;

  for (const item of results) {
    const registered = String(item.registered || "");
    const detailsLower = String(item.details || "").toLowerCase();
    const isWarrant =
      detailsLower.includes("warrant") || detailsLower.includes("option");

    let skipNotRegistered = registered.includes("Not Registered");
    if (skipNotRegistered && !isWarrant) {
      const filedAtStr = String(item.filed_at || "").slice(0, 10);
      if (filedAtStr) {
        const t = Date.parse(filedAtStr);
        if (!Number.isNaN(t) && t < sixMonthsAgo) skipNotRegistered = false;
      }
    }
    if (skipNotRegistered) continue;

    const wpx = item.warrants_exercise_price;
    const cpx = item.conversion_price;

    if (isWarrant && typeof wpx === "number" && wpx <= maxPrice) {
      const remaining = Number(item.warrants_remaining || 0) || 0;
      if (remaining > 0) warrants.push(item);
    } else if (!isWarrant && typeof cpx === "number" && cpx <= maxPrice) {
      const remaining = Number(item.underlying_shares_remaining || 0) || 0;
      if (remaining > 0) convertibles.push(item);
    }
  }

  return { warrants, convertibles };
}

export type AskEdgarDetailPayload = {
  ticker: string;
  dilution: Record<string, unknown> | null;
  floatData: Record<string, unknown> | null;
  newsFeed: Record<string, unknown>[];
  chartAnalysis: Record<string, unknown> | null;
  stockPrice: number | null;
  inPlay: {
    warrants: Record<string, unknown>[];
    convertibles: Record<string, unknown>[];
  };
  offerings: Record<string, unknown>[];
  /** Present when upstream signaled rate limit or auth failure on any sub-request. */
  meta?: {
    rateLimited?: boolean;
    authError?: boolean;
  };
};

export async function loadAskEdgarDetail(
  ticker: string,
  apiKey: string
): Promise<AskEdgarDetailPayload> {
  const sym = ticker.trim().toUpperCase();
  const httpCtx: AskEdgarHttpCtx = { saw429: false, saw401: false, maxStatus: 0 };

  // Sequential (not Promise.all) so we never open many Ask Edgar connections at once;
  // combined with global throttle this avoids 429s from burst + duplicate module instances.
  const dilution = await fetchDilutionRecord(apiKey, sym, httpCtx);
  const floatData = await fetchFloatRecord(apiKey, sym, httpCtx);
  const newsRaw = await fetchNewsResults(apiKey, sym, httpCtx);
  const chartAnalysis = await fetchChartAnalysis(apiKey, sym, httpCtx);
  const screenerPrice = await fetchScreenerPrice(apiKey, sym, httpCtx);
  const dilDataResults = await fetchDilutionDataResults(apiKey, sym, httpCtx);
  const offerings = await fetchOfferings(apiKey, sym, httpCtx);

  let stockPrice = screenerPrice;
  if (stockPrice == null || stockPrice <= 0) {
    const c = dilution?.last_price;
    if (typeof c === "number" && c > 0) stockPrice = c;
  }

  const inPlay =
    stockPrice && stockPrice > 0
      ? filterInPlayDilution(dilDataResults, stockPrice)
      : { warrants: [], convertibles: [] };

  const sortNews = (arr: Record<string, unknown>[]) =>
    [...arr].sort((a, b) => {
      const ta = Date.parse(String(a.created_at || a.filed_at || ""));
      const tb = Date.parse(String(b.created_at || b.filed_at || ""));
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    });

  const grokLine = (() => {
    for (const r of newsRaw) {
      if (String(r.form_type) !== "grok") continue;
      const summary = String(r.summary || "");
      for (const line of summary.split("\n")) {
        const s = line.trim().replace(/^-\s*/, "").trim();
        if (s)
          return {
            line: s,
            date: String(r.created_at || r.filed_at || ""),
            url: String(r.url || r.document_url || ""),
          };
      }
    }
    return null;
  })();

  const headlines = sortNews(
    newsRaw.filter((r) => ["news", "8-K", "6-K"].includes(String(r.form_type)))
  ).slice(0, 6);

  const newsFeed: Record<string, unknown>[] = [...headlines];
  if (grokLine) {
    newsFeed.push({
      form_type: "grok",
      title: grokLine.line,
      summary: grokLine.line,
      filed_at: grokLine.date,
      url: grokLine.url,
    });
  }

  const meta =
    httpCtx.saw429 || httpCtx.saw401
      ? {
          ...(httpCtx.saw429 ? { rateLimited: true as const } : {}),
          ...(httpCtx.saw401 ? { authError: true as const } : {}),
        }
      : undefined;

  return {
    ticker: sym,
    dilution,
    floatData,
    newsFeed,
    chartAnalysis,
    stockPrice,
    inPlay,
    offerings,
    ...(meta && Object.keys(meta).length ? { meta } : {}),
  };
}

const DETAIL_CACHE_TTL_MS = 30 * 60 * 1000;
const DETAIL_CACHE_MAX_ENTRIES = 200;

const detailServerCache = new Map<
  string,
  { expires: number; payload: AskEdgarDetailPayload }
>();

function isDetailPayloadCacheable(p: AskEdgarDetailPayload): boolean {
  return !p.meta?.rateLimited && !p.meta?.authError;
}

function rememberDetailInServerCache(sym: string, payload: AskEdgarDetailPayload) {
  if (!isDetailPayloadCacheable(payload)) return;
  if (detailServerCache.size >= DETAIL_CACHE_MAX_ENTRIES) {
    const oldest = detailServerCache.keys().next().value;
    if (oldest !== undefined) detailServerCache.delete(oldest);
  }
  detailServerCache.set(sym, {
    expires: Date.now() + DETAIL_CACHE_TTL_MS,
    payload,
  });
}

/**
 * Same as loadAskEdgarDetail but reuses the last good response per ticker for 30 minutes
 * (in-process; best effort on serverless). Skips cache for rate-limit / auth error payloads.
 */
export async function loadAskEdgarDetailCached(
  ticker: string,
  apiKey: string
): Promise<AskEdgarDetailPayload> {
  const sym = ticker.trim().toUpperCase();
  const hit = detailServerCache.get(sym);
  if (hit && hit.expires > Date.now()) return hit.payload;

  const payload = await loadAskEdgarDetail(sym, apiKey);
  rememberDetailInServerCache(sym, payload);
  return payload;
}
