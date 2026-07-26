// lib/droppiness/gainers.ts
// Pull today's top gainers into the droppiness refresh universe.

import { addToUniverse, readUniverse } from './kv';

const GAINERS_URL =
  'https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/gainers';

export type GainersIngestResult = {
  ok: boolean;
  fetched: number;
  added: number;
  universeSize: number;
  tickers: string[];
  error?: string;
};

/**
 * Fetch Polygon top gainers (typically ~20) and upsert into drop:universe.
 * Does not compute droppiness — only seeds the nightly refresh list.
 */
export async function ingestPolygonGainers(): Promise<GainersIngestResult> {
  const key = process.env.POLYGON_API_KEY;
  if (!key) {
    return {
      ok: false,
      fetched: 0,
      added: 0,
      universeSize: (await readUniverse()).length,
      tickers: [],
      error: 'POLYGON_API_KEY missing',
    };
  }

  try {
    const res = await fetch(`${GAINERS_URL}?include_otc=false&apiKey=${key}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        ok: false,
        fetched: 0,
        added: 0,
        universeSize: (await readUniverse()).length,
        tickers: [],
        error: `polygon gainers ${res.status}`,
      };
    }

    const json = await res.json();
    const rows: unknown[] = Array.isArray(json?.tickers) ? json.tickers : [];
    const tickers = rows
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const t = (row as { ticker?: string }).ticker;
        return typeof t === 'string' ? t.toUpperCase() : null;
      })
      .filter((t): t is string => !!t && /^[A-Z][A-Z0-9.-]{0,9}$/.test(t));

    const before = new Set(await readUniverse());
    let added = 0;
    for (const t of tickers) {
      if (!before.has(t)) added++;
      await addToUniverse(t);
      before.add(t);
    }

    const universe = await readUniverse();
    return {
      ok: true,
      fetched: tickers.length,
      added,
      universeSize: universe.length,
      tickers,
    };
  } catch (err) {
    return {
      ok: false,
      fetched: 0,
      added: 0,
      universeSize: (await readUniverse()).length,
      tickers: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
