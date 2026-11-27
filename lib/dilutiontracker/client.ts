// DilutionTracker API client (edge-safe: plain fetch, no node-only modules).
// Auth: `x-api-key` header from DILUTIONTRACKER_API_KEY.
// Complimentary plan: cash-position is capped at 100 distinct tickers per
// calendar month (UTC). Callers must cache results; see fetchDilutionTracker.ts.

export const DT_BASE_URL = 'https://api.dilutiontracker.com';
const TIMEOUT_MS = 4000;

export type DtUnavailableReason =
  | 'no_key'
  | 'quota'
  | 'rate_limited'
  | 'plan'
  | 'auth'
  | 'upstream'
  | 'network';

/**
 * Result of one API call.
 * - ok: parsed JSON body.
 * - not_found: the API has no record for this ticker (404 or 400 "no company profile").
 * - unavailable: we could not get data. Transient reasons are retryable; quota is not.
 */
export type DtResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'not_found' }
  | { status: 'unavailable'; reason: DtUnavailableReason };

export function dilutionTrackerKey(): string | null {
  const key = process.env.DILUTIONTRACKER_API_KEY?.trim();
  return key ? key : null;
}

async function problemType(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { type?: unknown };
    return typeof body.type === 'string' ? body.type : '';
  } catch {
    return '';
  }
}

export async function dtGet<T>(path: string): Promise<DtResult<T>> {
  const key = dilutionTrackerKey();
  if (!key) return { status: 'unavailable', reason: 'no_key' };

  let res: Response;
  try {
    res = await fetch(`${DT_BASE_URL}${path}`, {
      headers: { 'x-api-key': key, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { status: 'unavailable', reason: 'network' };
  }

  if (res.ok) {
    try {
      return { status: 'ok', data: (await res.json()) as T };
    } catch {
      return { status: 'unavailable', reason: 'upstream' };
    }
  }

  if (res.status === 404) return { status: 'not_found' };
  if (res.status === 400) return { status: 'not_found' };
  if (res.status === 403) return { status: 'unavailable', reason: 'plan' };
  if (res.status === 401) return { status: 'unavailable', reason: 'auth' };
  if (res.status === 429) {
    const type = await problemType(res);
    return {
      status: 'unavailable',
      reason: type.includes('quota') ? 'quota' : 'rate_limited',
    };
  }
  return { status: 'unavailable', reason: 'upstream' };
}
