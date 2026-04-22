/**
 * FMP “biggest gainers” for Dilution Monitor cross-check (server-side).
 */

import {
  TOP_GAINERS_MAX_PRICE,
  TOP_GAINERS_MIN_CHANGE_PCT,
  TOP_GAINERS_MIN_PRICE,
  type TopGainerRow,
} from "@/lib/topGainers";

const US_TICKER_RE = /^[A-Z]{2,4}$/;

function cleanSecret(raw: string | undefined): string {
  if (!raw) return "";
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** Static env access for Next.js bundler. */
export function getFmpApiKeyFromEnv(): string {
  return cleanSecret(process.env.FMP_API_KEY) || "";
}

function parsePct(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "")
    .replace(/%/g, "")
    .trim();
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export async function fetchFmpGainerRows(apiKey: string): Promise<TopGainerRow[]> {
  const url = new URL("https://financialmodelingprep.com/stable/biggest-gainers");
  url.searchParams.set("apikey", apiKey);
  const resp = await fetch(url.toString(), { cache: "no-store" });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`FMP ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data: unknown = await resp.json();
  if (!Array.isArray(data)) return [];

  const rows: TopGainerRow[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const sym = String(o.symbol || "")
      .trim()
      .toUpperCase();
    if (!US_TICKER_RE.test(sym)) continue;

    const pct = parsePct(o.changesPercentage);
    if (pct == null || pct < TOP_GAINERS_MIN_CHANGE_PCT) continue;

    const price = parseNum(o.price);
    if (
      price == null ||
      price < TOP_GAINERS_MIN_PRICE ||
      price > TOP_GAINERS_MAX_PRICE
    ) {
      continue;
    }

    const volRaw = parseNum(o.volume);
    const changeAbs = parseNum(o.change);

    rows.push({
      ticker: sym,
      changePct: pct,
      changeAbs,
      price,
      volume: volRaw != null && Number.isFinite(volRaw) ? Math.round(volRaw) : null,
      askEdgar: null,
    });
  }

  rows.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  return rows.slice(0, 30);
}
