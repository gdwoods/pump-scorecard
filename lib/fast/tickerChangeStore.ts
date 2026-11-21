// lib/fast/tickerChangeStore.ts
// Shared ticker-change history in Supabase. Short Check reads this before
// calling AskEdgar. AskEdgar results are written back when a service key is set.

import type { TickerChangeEvent, TickerChanges } from './types';

export const TICKER_CHANGE_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
const STORE_TIMEOUT_MS = 1500;

export type StoredTickerChangeEvent = {
  old_ticker: string;
  new_ticker: string;
  effective_date: string;
  issuer_name?: string | null;
  cik?: string | null;
  security_id?: string | null;
  source?: string | null;
};

type SupabaseConfig = {
  url: string;
  anonKey: string;
  serviceKey: string | null;
};

export function supabaseTickerConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    null;
  return { url, anonKey, serviceKey };
}

/** Map stored events into the fast-verdict overlay. Null when there is no usable event. */
export function tickerChangesFromEvents(
  symbol: string,
  rows: StoredTickerChangeEvent[]
): TickerChanges | null {
  const history: TickerChangeEvent[] = [];
  for (const row of rows) {
    const oldTicker = String(row.old_ticker ?? '')
      .trim()
      .toUpperCase();
    const newTicker = String(row.new_ticker ?? '')
      .trim()
      .toUpperCase();
    const effectiveDate = String(row.effective_date ?? '').slice(0, 10);
    if (!oldTicker || !newTicker || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) continue;
    history.push({ oldTicker, newTicker, effectiveDate });
  }
  history.sort(
    (a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) ||
      a.oldTicker.localeCompare(b.oldTicker) ||
      a.newTicker.localeCompare(b.newTicker)
  );
  if (!history.length) return null;

  const latestDate = history[history.length - 1].effectiveDate;
  const latestTickers = new Set(
    history.filter((event) => event.effectiveDate === latestDate).map((event) => event.newTicker)
  );
  return {
    status: 'changed',
    queryTicker: symbol,
    currentTicker: latestTickers.size === 1 ? [...latestTickers][0] : null,
    history,
    warnings: latestTickers.size > 1 ? ['competing_destinations'] : [],
  };
}

function authHeaders(key: string, extra?: Record<string, string>): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    ...extra,
  };
}

async function supabaseGet<T>(cfg: SupabaseConfig, path: string): Promise<T | null> {
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    headers: authHeaders(cfg.anonKey),
    cache: 'no-store',
    signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function readStoredTickerChanges(symbol: string): Promise<TickerChanges | null> {
  const cfg = supabaseTickerConfig();
  if (!cfg) return null;
  try {
    const direct = await supabaseGet<StoredTickerChangeEvent[]>(
      cfg,
      `ticker_change_events?or=(old_ticker.eq.${symbol},new_ticker.eq.${symbol})&select=old_ticker,new_ticker,effective_date,security_id`
    );
    if (!Array.isArray(direct)) return null;

    let rows = direct;
    const securityIds = [
      ...new Set(rows.map((row) => row.security_id).filter((id): id is string => Boolean(id))),
    ];
    if (securityIds.length) {
      const list = securityIds.map((id) => `"${id}"`).join(',');
      const chain = await supabaseGet<StoredTickerChangeEvent[]>(
        cfg,
        `ticker_change_events?security_id=in.(${list})&select=old_ticker,new_ticker,effective_date,security_id`
      );
      if (Array.isArray(chain) && chain.length) rows = chain;
    }

    const fromEvents = tickerChangesFromEvents(symbol, rows);
    if (fromEvents) return fromEvents;

    const lookups = await supabaseGet<Array<{ has_changes: boolean; checked_at: string }>>(
      cfg,
      `ticker_change_lookups?ticker=eq.${symbol}&select=has_changes,checked_at&limit=1`
    );
    const lookup = Array.isArray(lookups) ? lookups[0] : null;
    if (!lookup || lookup.has_changes !== false) return null;
    const checkedAt = Date.parse(lookup.checked_at);
    if (!Number.isFinite(checkedAt) || Date.now() - checkedAt >= TICKER_CHANGE_RECHECK_MS) {
      return null;
    }
    return {
      status: 'none',
      queryTicker: symbol,
      currentTicker: null,
      history: [],
      warnings: [],
    };
  } catch {
    return null;
  }
}

export async function writeStoredTickerChanges(
  symbol: string,
  value: TickerChanges
): Promise<void> {
  const cfg = supabaseTickerConfig();
  if (!cfg?.serviceKey) return;
  if (value.status !== 'changed' && value.status !== 'none') return;

  const headers = authHeaders(cfg.serviceKey, {
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  });
  try {
    if (value.status === 'changed' && value.history.length) {
      await fetch(
        `${cfg.url}/rest/v1/ticker_change_events?on_conflict=old_ticker,new_ticker,effective_date`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(
            value.history.map((event) => ({
              old_ticker: event.oldTicker,
              new_ticker: event.newTicker,
              effective_date: event.effectiveDate,
              source: 'askedgar',
            }))
          ),
          cache: 'no-store',
          signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
        }
      );
    }
    await fetch(`${cfg.url}/rest/v1/ticker_change_lookups?on_conflict=ticker`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ticker: symbol,
        has_changes: value.status === 'changed',
        checked_at: new Date().toISOString(),
        source: 'askedgar',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    });
  } catch {
    // A failed write leaves the verdict intact. The next miss can try again.
  }
}
