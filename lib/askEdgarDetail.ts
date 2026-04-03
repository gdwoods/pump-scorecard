/**
 * Server-side Ask Edgar aggregates for the Dilution Monitor detail panel.
 * Endpoints mirror jasontange/Top-Gainers-Dilution-Monitor-V2-Public (das_monitor.py).
 */

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

async function aeGet(
  url: string,
  search: Record<string, string>,
  apiKey: string,
  ms = 14_000
): Promise<unknown | null> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(search)) u.searchParams.set(k, v);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(u.toString(), {
      method: "GET",
      headers: { "API-KEY": apiKey, "Content-Type": "application/json" },
      signal: ac.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
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
  sym: string
): Promise<Record<string, unknown> | null> {
  for (const url of [AE.dilutionE, AE.dilutionV1]) {
    const data = await aeGet(
      url,
      { ticker: sym, offset: "0", limit: "10" },
      apiKey
    );
    const row = firstResult(data);
    if (row) return row;
  }
  return null;
}

export async function fetchFloatRecord(
  apiKey: string,
  sym: string
): Promise<Record<string, unknown> | null> {
  const data = await aeGet(
    AE.floatE,
    { ticker: sym, offset: "0", limit: "100" },
    apiKey
  );
  return firstResult(data);
}

export async function fetchNewsResults(
  apiKey: string,
  sym: string
): Promise<Record<string, unknown>[]> {
  const data = await aeGet(
    AE.newsE,
    { ticker: sym, offset: "0", limit: "100" },
    apiKey
  );
  if (!aeSuccess(data)) return [];
  const r = (data as Record<string, unknown>).results;
  return Array.isArray(r) ? (r as Record<string, unknown>[]) : [];
}

export async function fetchChartAnalysis(
  apiKey: string,
  sym: string
): Promise<Record<string, unknown> | null> {
  const data = await aeGet(AE.chartV1, { ticker: sym, limit: "1" }, apiKey);
  return firstResult(data);
}

export async function fetchScreenerPrice(
  apiKey: string,
  sym: string
): Promise<number | null> {
  const data = await aeGet(AE.screenerE, { ticker: sym }, apiKey);
  const row = firstResult(data);
  if (!row) return null;
  const p = row.price;
  return typeof p === "number" && Number.isFinite(p) ? p : null;
}

export async function fetchDilutionDataResults(
  apiKey: string,
  sym: string
): Promise<Record<string, unknown>[]> {
  const data = await aeGet(
    AE.dilDataE,
    { ticker: sym, offset: "0", limit: "40" },
    apiKey
  );
  if (!aeSuccess(data)) return [];
  const r = (data as Record<string, unknown>).results;
  return Array.isArray(r) ? (r as Record<string, unknown>[]) : [];
}

export async function fetchOfferings(
  apiKey: string,
  sym: string
): Promise<Record<string, unknown>[]> {
  const data = await aeGet(AE.offeringsV1, { ticker: sym, limit: "5" }, apiKey);
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
};

export async function loadAskEdgarDetail(
  ticker: string,
  apiKey: string
): Promise<AskEdgarDetailPayload> {
  const sym = ticker.trim().toUpperCase();

  const [
    dilution,
    floatData,
    newsRaw,
    chartAnalysis,
    screenerPrice,
    dilDataResults,
    offerings,
  ] = await Promise.all([
    fetchDilutionRecord(apiKey, sym),
    fetchFloatRecord(apiKey, sym),
    fetchNewsResults(apiKey, sym),
    fetchChartAnalysis(apiKey, sym),
    fetchScreenerPrice(apiKey, sym),
    fetchDilutionDataResults(apiKey, sym),
    fetchOfferings(apiKey, sym),
  ]);

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

  return {
    ticker: sym,
    dilution,
    floatData,
    newsFeed,
    chartAnalysis,
    stockPrice,
    inPlay,
    offerings,
  };
}
