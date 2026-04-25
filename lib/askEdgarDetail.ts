/**
 * Server-side Ask Edgar aggregates for the Dilution Monitor detail panel.
 * Endpoints mirror jasontange/Top-Gainers-Dilution-Monitor-V2-Public (das_monitor.py).
 */

import { acquireAskEdgarRequestSlot } from "@/lib/askEdgarThrottle";
import { getKVClient } from "@/lib/shareStorage";

const AE = {
  dilutionE: "https://eapi.askedgar.io/enterprise/v1/dilution-rating",
  dilutionV1: "https://eapi.askedgar.io/v1/dilution-rating",
  floatE: "https://eapi.askedgar.io/enterprise/v1/float-outstanding",
  newsE: "https://eapi.askedgar.io/enterprise/v1/news",
  dilDataE: "https://eapi.askedgar.io/enterprise/v1/dilution-data",
  screenerE: "https://eapi.askedgar.io/enterprise/v1/screener",
  registrationsE: "https://eapi.askedgar.io/enterprise/v1/registrations",
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

function numField(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/%/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type AskEdgarScreenerSlice = {
  price: number | null;
  shortFloat: number | null;
  feeRate: number | null;
  daysToCover: number | null;
  volAvg: number | null;
  exchange: string | null;
};

export function mapScreenerRow(row: Record<string, unknown> | null): AskEdgarScreenerSlice {
  if (!row) {
    return {
      price: null,
      shortFloat: null,
      feeRate: null,
      daysToCover: null,
      volAvg: null,
      exchange: null,
    };
  }
  const ex = row.exchange;
  return {
    price: numField(row.price),
    shortFloat: numField(row.short_float),
    feeRate: numField(row.feerate),
    daysToCover: numField(row.days_to_cover),
    volAvg: numField(row.vol_avg),
    exchange: typeof ex === "string" && ex.trim() ? ex.trim() : null,
  };
}

export async function fetchScreenerRecord(
  apiKey: string,
  sym: string,
  ctx?: AskEdgarHttpCtx
): Promise<Record<string, unknown> | null> {
  const data = await aeGet(AE.screenerE, { ticker: sym }, apiKey, 14_000, ctx);
  return firstResult(data);
}

/** @deprecated prefer fetchScreenerRecord + mapScreenerRow().price */
export async function fetchScreenerPrice(
  apiKey: string,
  sym: string,
  ctx?: AskEdgarHttpCtx
): Promise<number | null> {
  const row = await fetchScreenerRecord(apiKey, sym, ctx);
  const p = mapScreenerRow(row).price;
  return p;
}

export async function fetchRegistrationsResults(
  apiKey: string,
  sym: string,
  ctx?: AskEdgarHttpCtx
): Promise<Record<string, unknown>[]> {
  const data = await aeGet(AE.registrationsE, { ticker: sym }, apiKey, 14_000, ctx);
  if (!aeSuccess(data)) return [];
  const r = (data as Record<string, unknown>).results;
  return Array.isArray(r) ? (r as Record<string, unknown>[]) : [];
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
  /** Screener fields (short %, borrow fee, etc.) when enterprise screener returns a row. */
  screener: AskEdgarScreenerSlice | null;
  /** Shelf / ATM / registration rows from Ask Edgar. */
  registrations: Record<string, unknown>[];
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

export type AskEdgarDetailMode = "basic" | "news" | "full";

export async function loadAskEdgarDetail(
  ticker: string,
  apiKey: string,
  mode: AskEdgarDetailMode = "full"
): Promise<AskEdgarDetailPayload> {
  const sym = ticker.trim().toUpperCase();
  const httpCtx: AskEdgarHttpCtx = { saw429: false, saw401: false, maxStatus: 0 };

  if (mode === "news") {
    const newsRaw = await fetchNewsResults(apiKey, sym, httpCtx);
    const newsFeed = [...newsRaw]
      .sort((a, b) => {
        const ta = Date.parse(String(a.created_at || a.filed_at || ""));
        const tb = Date.parse(String(b.created_at || b.filed_at || ""));
        return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
      })
      .slice(0, 12);

    const meta =
      httpCtx.saw429 || httpCtx.saw401
        ? {
            ...(httpCtx.saw429 ? { rateLimited: true as const } : {}),
            ...(httpCtx.saw401 ? { authError: true as const } : {}),
          }
        : undefined;

    return {
      ticker: sym,
      dilution: null,
      floatData: null,
      newsFeed,
      chartAnalysis: null,
      stockPrice: null,
      screener: null,
      registrations: [],
      inPlay: { warrants: [], convertibles: [] },
      offerings: [],
      ...(meta && Object.keys(meta).length ? { meta } : {}),
    };
  }

  const [dilution, floatData, screenerRow, newsRaw] = await Promise.all([
    fetchDilutionRecord(apiKey, sym, httpCtx),
    fetchFloatRecord(apiKey, sym, httpCtx),
    fetchScreenerRecord(apiKey, sym, httpCtx),
    mode === "full" ? fetchNewsResults(apiKey, sym, httpCtx) : Promise.resolve([]),
  ]);

  const [chartAnalysis, dilDataResults, offerings, registrations] =
    mode === "full"
      ? await Promise.all([
          fetchChartAnalysis(apiKey, sym, httpCtx),
          fetchDilutionDataResults(apiKey, sym, httpCtx),
          fetchOfferings(apiKey, sym, httpCtx),
          fetchRegistrationsResults(apiKey, sym, httpCtx),
        ])
      : ([null, [], [], []] as const);

  const screener = mapScreenerRow(screenerRow);
  let stockPrice = screener.price;
  if (stockPrice == null || stockPrice <= 0) {
    const c = dilution?.last_price;
    if (typeof c === "number" && c > 0) stockPrice = c;
  }

  const inPlay =
    mode === "full" && stockPrice && stockPrice > 0
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

  const newsFeed: Record<string, unknown>[] = (() => {
    if (mode !== "full") return [];
    const headlines = sortNews(
      newsRaw.filter((r) => ["news", "8-K", "6-K"].includes(String(r.form_type)))
    ).slice(0, 6);
    const arr: Record<string, unknown>[] = [...headlines];
    if (grokLine) {
      arr.push({
        form_type: "grok",
        title: grokLine.line,
        summary: grokLine.line,
        filed_at: grokLine.date,
        url: grokLine.url,
      });
    }
    return arr;
  })();

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
    screener,
    registrations,
    inPlay,
    offerings,
    ...(meta && Object.keys(meta).length ? { meta } : {}),
  };
}

/** Warm-instance cache — longer TTL reduces Ask Edgar burn when a symbol is re-requested. */
const DETAIL_CACHE_TTL_MS = 45 * 60 * 1000;
const DETAIL_CACHE_MAX_ENTRIES = 200;

const detailServerCache = new Map<
  string,
  { expires: number; payload: AskEdgarDetailPayload }
>();

/** Coalesce concurrent detail requests for the same ticker (e.g. many users / double-mount). */
const detailInflight = new Map<string, Promise<AskEdgarDetailPayload>>();

function isDetailPayloadCacheable(p: AskEdgarDetailPayload): boolean {
  return !p.meta?.rateLimited && !p.meta?.authError;
}

/** Set `ASK_EDGAR_DETAIL_REMOTE_CACHE=0` to skip KV reads/writes (same vars as share links: KV_REST_*). */
function remoteDetailCacheEnabled(): boolean {
  const v = process.env.ASK_EDGAR_DETAIL_REMOTE_CACHE?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

const REMOTE_DETAIL_KEY_PREFIX = "aed:v2:";
const REMOTE_DETAIL_TTL_SEC = 45 * 60;

async function getRemoteCachedDetail(
  cacheKey: string
): Promise<AskEdgarDetailPayload | null> {
  if (!remoteDetailCacheEnabled()) return null;
  try {
    const kv = await getKVClient();
    if (!kv) return null;
    const raw = await kv.get(`${REMOTE_DETAIL_KEY_PREFIX}${cacheKey}`);
    if (!raw || typeof raw !== "string") return null;
    const parsed = JSON.parse(raw) as AskEdgarDetailPayload;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function setRemoteCachedDetail(
  cacheKey: string,
  payload: AskEdgarDetailPayload
): Promise<void> {
  if (!remoteDetailCacheEnabled() || !isDetailPayloadCacheable(payload)) return;
  try {
    const kv = await getKVClient();
    if (!kv) return;
    await kv.setex(
      `${REMOTE_DETAIL_KEY_PREFIX}${cacheKey}`,
      REMOTE_DETAIL_TTL_SEC,
      JSON.stringify(payload)
    );
  } catch (e) {
    console.warn("[AskEdgarDetail] remote cache set failed", {
      cacheKey,
      err: String(e),
    });
  }
}

function rememberDetailInServerCache(cacheKey: string, payload: AskEdgarDetailPayload) {
  if (!isDetailPayloadCacheable(payload)) return;
  if (detailServerCache.size >= DETAIL_CACHE_MAX_ENTRIES) {
    const oldest = detailServerCache.keys().next().value;
    if (oldest !== undefined) detailServerCache.delete(oldest);
  }
  detailServerCache.set(cacheKey, {
    expires: Date.now() + DETAIL_CACHE_TTL_MS,
    payload,
  });
}

/**
 * Same as loadAskEdgarDetail but reuses the last good response per ticker for 45 minutes:
 * L1 in-process Map, L2 Vercel KV / Redis (when `KV_REST_*` env is set — see `getKVClient()` in shareStorage).
 * Skips cache for rate-limit / auth error payloads. Concurrent identical requests on one instance share one upstream fan-out.
 */
export async function loadAskEdgarDetailCached(
  ticker: string,
  apiKey: string,
  mode: AskEdgarDetailMode = "full"
): Promise<AskEdgarDetailPayload> {
  const sym = ticker.trim().toUpperCase();
  const cacheKey = `${sym}|${mode}`;
  const hit = detailServerCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.payload;

  const remote = await getRemoteCachedDetail(cacheKey);
  if (remote && isDetailPayloadCacheable(remote)) {
    rememberDetailInServerCache(cacheKey, remote);
    return remote;
  }

  const existing = detailInflight.get(cacheKey);
  if (existing) return existing;

  const work = (async () => {
    try {
      const payload = await loadAskEdgarDetail(sym, apiKey, mode);
      rememberDetailInServerCache(cacheKey, payload);
      await setRemoteCachedDetail(cacheKey, payload);
      return payload;
    } finally {
      detailInflight.delete(cacheKey);
    }
  })();

  detailInflight.set(cacheKey, work);
  return work;
}
