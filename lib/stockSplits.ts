/**
 * Stock split history for dilution monitor. Tries Massive REST first (Polygon successor),
 * then Polygon v3 reference splits — same API key (`POLYGON_API_KEY`) for both hosts.
 * @see https://massive.com/docs/rest/stocks/corporate-actions/splits
 */

const THREE_YEARS_MS = 1000 * 60 * 60 * 24 * 365 * 3;

export type StockSplitRow = {
  executionDate: string;
  ratioLabel: string;
  adjustmentType: string | null;
};

type MassiveSplitResult = {
  adjustment_type?: string;
  execution_date?: string;
  split_from?: number;
  split_to?: number;
};

type PolygonV3SplitResult = {
  execution_date?: string;
  split_from?: number;
  split_to?: number;
};

function inferAdjustmentType(from: number, to: number): string | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0)
    return null;
  if (to > from) return "forward_split";
  if (to < from) return "reverse_split";
  return null;
}

function ratioLabel(from: number, to: number): string {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "—";
  return `${to}-for-${from}`;
}

function withinLookback(isoDate: string, sinceMs: number): boolean {
  const t = Date.parse(isoDate);
  if (Number.isNaN(t)) return false;
  return t > sinceMs;
}

function normalizeRow(
  executionDate: string,
  splitFrom: number,
  splitTo: number,
  adjustmentType: string | null,
  sinceMs: number
): StockSplitRow | null {
  if (!withinLookback(executionDate, sinceMs)) return null;
  return {
    executionDate,
    ratioLabel: ratioLabel(splitFrom, splitTo),
    adjustmentType,
  };
}

async function fetchMassiveSplits(
  apiKey: string,
  ticker: string,
  limit: number
): Promise<StockSplitRow[]> {
  const u = new URL("https://api.massive.com/stocks/v1/splits");
  u.searchParams.set("ticker", ticker);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("sort", "execution_date.desc");
  u.searchParams.set("apiKey", apiKey);

  const res = await fetch(u.toString(), { cache: "no-store" });
  if (!res.ok) return [];

  const j = (await res.json()) as {
    status?: string;
    results?: MassiveSplitResult[];
  };

  if (String(j.status || "").toUpperCase() !== "OK" || !Array.isArray(j.results))
    return [];

  const since = Date.now() - THREE_YEARS_MS;
  const out: StockSplitRow[] = [];

  for (const r of j.results) {
    const d = String(r.execution_date || "");
    const from = Number(r.split_from);
    const to = Number(r.split_to);
    if (!d || !Number.isFinite(from) || !Number.isFinite(to)) continue;
    const adj = r.adjustment_type
      ? String(r.adjustment_type)
      : inferAdjustmentType(from, to);
    const row = normalizeRow(d, from, to, adj, since);
    if (row) out.push(row);
  }

  return out;
}

async function fetchPolygonV3Splits(
  apiKey: string,
  ticker: string,
  maxResults: number
): Promise<StockSplitRow[]> {
  const since = Date.now() - THREE_YEARS_MS;
  const out: StockSplitRow[] = [];

  let url: string | null =
    `https://api.polygon.io/v3/reference/splits?ticker=${encodeURIComponent(ticker)}&limit=100&apiKey=${encodeURIComponent(apiKey)}`;

  while (url && out.length < maxResults) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) break;

    const j = (await res.json()) as {
      results?: PolygonV3SplitResult[];
      next_url?: string;
    };

    const batch = Array.isArray(j.results) ? j.results : [];
    for (const r of batch) {
      const d = String(r.execution_date || "");
      const from = Number(r.split_from);
      const to = Number(r.split_to);
      if (!d || !Number.isFinite(from) || !Number.isFinite(to)) continue;
      const adj = inferAdjustmentType(from, to);
      const row = normalizeRow(d, from, to, adj, since);
      if (row) out.push(row);
      if (out.length >= maxResults) break;
    }

    url =
      j.next_url && out.length < maxResults
        ? `${j.next_url}${j.next_url.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(apiKey)}`
        : null;
  }

  return out.slice(0, maxResults);
}

export type StockSplitsSource = "massive" | "polygon";

/**
 * Returns recent splits (last ~3 years), newest first. Massive first, then Polygon.
 */
export async function fetchStockSplitsForTicker(
  apiKey: string,
  ticker: string,
  limit = 15
): Promise<{ splits: StockSplitRow[]; source: StockSplitsSource }> {
  const sym = ticker.trim().toUpperCase();
  if (!sym) return { splits: [], source: "polygon" };

  const massive = await fetchMassiveSplits(apiKey, sym, limit);
  if (massive.length > 0) return { splits: massive, source: "massive" };

  const poly = await fetchPolygonV3Splits(apiKey, sym, limit);
  return { splits: poly, source: "polygon" };
}
