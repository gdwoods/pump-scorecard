// Server-side FINRA Query API pull for daily TRF short-sale volume.
// The otcMarket/regShoDaily dataset is public; a client credential is used
// when FINRA_API_CLIENT and FINRA_API_SECRET are set.

import { T } from '@/lib/config/thresholds';
import {
  aggregateFacilityRows,
  applyConsolidatedVolume,
  regShoShortVolumeCacheUntil,
  type FinraRegShoDailyRow,
  type RegShoShortDay,
} from './regShoShortVolume';

const DATASET_URL = 'https://api.finra.org/data/group/otcMarket/name/regShoDaily';
const TOKEN_URL =
  'https://ews.fip.finra.org/fip/rest/ews/oauth2/access_token?grant_type=client_credentials';

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

type ResultCache = { expires: number; days: RegShoShortDay[] };
const resultCache = new Map<string, ResultCache>();

function easternYmd(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

async function getFinraAccessToken(fetchImpl: typeof fetch): Promise<string | null> {
  const clientId = process.env.FINRA_API_CLIENT?.trim();
  const clientSecret = process.env.FINRA_API_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof json.access_token !== 'string' || json.access_token.length < 10) return null;
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 1800;
  tokenCache = { token: json.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return json.access_token;
}

async function fetchConsolidatedVolume(
  ticker: string,
  fetchImpl: typeof fetch
): Promise<Map<string, number>> {
  const key = process.env.POLYGON_API_KEY?.trim();
  if (!key) return new Map();
  const end = new Date();
  const start = new Date();
  start.setUTCDate(end.getUTCDate() - T.regShoShortVolume.lookbackCalendarDays - 5);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50&apiKey=${key}`;
  const res = await fetchImpl(url, { cache: 'no-store' });
  if (!res.ok) return new Map();
  const json = (await res.json()) as { results?: Array<{ t?: number; v?: number }> };
  const volumes = new Map<string, number>();
  for (const bar of json.results ?? []) {
    if (typeof bar.t !== 'number' || typeof bar.v !== 'number' || bar.v <= 0) continue;
    volumes.set(new Date(bar.t).toISOString().slice(0, 10), bar.v);
  }
  return volumes;
}

export async function fetchRegShoShortVolume(
  ticker: string,
  options?: { fetchImpl?: typeof fetch; bypassCache?: boolean }
): Promise<RegShoShortDay[]> {
  const symbol = ticker.trim().toUpperCase();
  const fetchImpl = options?.fetchImpl ?? fetch;
  if (!options?.bypassCache) {
    const hit = resultCache.get(symbol);
    if (hit && hit.expires > Date.now()) return hit.days;
  }

  const since = easternYmd(T.regShoShortVolume.lookbackCalendarDays);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  try {
    const token = await getFinraAccessToken(fetchImpl);
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // The public dataset still answers without a bearer token.
  }

  const res = await fetchImpl(DATASET_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      limit: 500,
      compareFilters: [
        {
          compareType: 'EQUAL',
          fieldName: 'securitiesInformationProcessorSymbolIdentifier',
          fieldValue: symbol,
        },
        {
          compareType: 'GREATER',
          fieldName: 'tradeReportDate',
          fieldValue: since,
        },
      ],
    }),
  });

  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`finra regShoDaily ${res.status}`);
  const rows = (await res.json()) as FinraRegShoDailyRow[];
  if (!Array.isArray(rows)) throw new Error('finra regShoDaily unexpected payload');

  let days = aggregateFacilityRows(rows);
  try {
    const volumes = await fetchConsolidatedVolume(symbol, fetchImpl);
    days = applyConsolidatedVolume(days, volumes);
  } catch {
    // Tape share is optional. The TRF print still stands.
  }

  if (!options?.bypassCache) {
    resultCache.set(symbol, { expires: regShoShortVolumeCacheUntil(), days });
  }
  return days;
}
