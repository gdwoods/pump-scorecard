import { unstable_cache } from 'next/cache';
import { dtGet, type DtResult, type DtUnavailableReason } from './client';

const DAY_SECONDS = 24 * 60 * 60;
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** Thrown inside cached functions so transient failures are never stored. */
class DtTransientError extends Error {
  constructor(readonly reason: DtUnavailableReason) {
    super(`dilutiontracker:${reason}`);
  }
}

async function loadDt<T>(path: string): Promise<DtResult<T>> {
  const result = await dtGet<T>(path);
  if (result.status === 'unavailable') throw new DtTransientError(result.reason);
  return result;
}

function normalizeTicker(ticker: string): string | null {
  const t = ticker.trim().toUpperCase();
  return TICKER_RE.test(t) ? t : null;
}

async function settle<T>(run: () => Promise<DtResult<T>>): Promise<DtResult<T>> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof DtTransientError) return { status: 'unavailable', reason: err.reason };
    return { status: 'unavailable', reason: 'network' };
  }
}

// ---------------------------------------------------------------------------
// Cash position → runway
// ---------------------------------------------------------------------------

type CashPositionBody = {
  ticker?: string;
  hasEstCurrentCash?: boolean;
  monthsCashRunway?: number;
  estCurrentCash?: number;
  lastReportedCashDate?: string;
};

export type DtCashPosition = {
  runwayMonths: number | null;
  cashMillions: number | null;
  lastReportedCashDate: string | null;
};

export function parseCashPosition(body: CashPositionBody): DtCashPosition | null {
  const runwayMonths = typeof body.monthsCashRunway === 'number' ? body.monthsCashRunway : null;
  const cashMillions = typeof body.estCurrentCash === 'number' ? body.estCurrentCash : null;
  if (runwayMonths === null && cashMillions === null) return null;
  return {
    runwayMonths,
    cashMillions,
    lastReportedCashDate: body.lastReportedCashDate ?? null,
  };
}

const cachedCashPosition = unstable_cache(
  async (ticker: string) =>
    loadDt<CashPositionBody>(`/v2/cash-position/${encodeURIComponent(ticker)}`),
  ['dilutiontracker-cash-position'],
  { revalidate: DAY_SECONDS }
);

/**
 * Cash position for one ticker. Each distinct ticker counts once per month
 * against the complimentary cash-position quota (100), so results are cached
 * for a day. Quota or rate-limit responses come back as `unavailable`.
 */
export async function fetchDtCashPosition(ticker: string): Promise<DtResult<DtCashPosition>> {
  const symbol = normalizeTicker(ticker);
  if (!symbol) return { status: 'not_found' };
  const result = await settle(() => cachedCashPosition(symbol));
  if (result.status !== 'ok') return result;
  const parsed = parseCashPosition(result.data);
  return parsed ? { status: 'ok', data: parsed } : { status: 'not_found' };
}

/** Runway context carried on the fast verdict. Display only; not a walk-away input. */
export type DtRunwayContext =
  | { status: 'ok'; runwayMonths: number | null; cashMillions: number | null; asOf: string | null }
  | { status: 'not_found' }
  | { status: 'unavailable'; reason: DtUnavailableReason };

export function toRunwayContext(result: DtResult<DtCashPosition>): DtRunwayContext {
  if (result.status === 'ok') {
    return {
      status: 'ok',
      runwayMonths: result.data.runwayMonths,
      cashMillions: result.data.cashMillions,
      asOf: result.data.lastReportedCashDate,
    };
  }
  if (result.status === 'not_found') return { status: 'not_found' };
  return { status: 'unavailable', reason: result.reason };
}

// ---------------------------------------------------------------------------
// Reverse splits
// ---------------------------------------------------------------------------

type ReverseSplitBody = {
  status?: 'upcoming' | 'voteApproved' | 'completed';
  splitRatio?: number | null;
  effectiveDate?: string;
};

export type DtSplit = {
  status: 'upcoming' | 'voteApproved' | 'completed';
  /** YYYY-MM-DD */
  date: string;
  /** "1-for-N" when the ratio is set; null while still pending. */
  ratio: string | null;
};

/** Keeps reverse splits only (ratio >= 1 or not yet set). Forward splits are dropped. */
export function parseReverseSplits(body: ReverseSplitBody[]): DtSplit[] {
  const out: DtSplit[] = [];
  for (const s of body) {
    if (!s.effectiveDate || !s.status) continue;
    const ratioNum = typeof s.splitRatio === 'number' ? s.splitRatio : null;
    if (ratioNum !== null && ratioNum < 1) continue;
    out.push({
      status: s.status,
      date: s.effectiveDate.slice(0, 10),
      ratio: ratioNum === null ? null : `1-for-${ratioNum}`,
    });
  }
  return out;
}

const cachedSplits = unstable_cache(
  async (ticker: string) =>
    loadDt<ReverseSplitBody[]>(`/v2/splits/${encodeURIComponent(ticker)}`),
  ['dilutiontracker-splits'],
  { revalidate: DAY_SECONDS }
);

/** Reverse-split history and schedule for one ticker. Unlimited on the complimentary plan. */
export async function fetchDtReverseSplits(ticker: string): Promise<DtResult<DtSplit[]>> {
  const symbol = normalizeTicker(ticker);
  if (!symbol) return { status: 'not_found' };
  const result = await settle(() => cachedSplits(symbol));
  if (result.status !== 'ok') return result;
  return { status: 'ok', data: parseReverseSplits(result.data) };
}

// ---------------------------------------------------------------------------
// Company profile (uncapped on complimentary; cached 24h)
// ---------------------------------------------------------------------------

export type CompanyProfileBody = {
  symbol?: string;
  companyName?: string;
  description?: string | null;
  industry?: string;
  sector?: string;
  website?: string | null;
  country?: string;
  exchange?: string;
  isDelisted?: boolean;
  inDtCoverage?: boolean;
};

export type DtProfile = {
  companyName: string | null;
  description: string | null;
  industry: string | null;
  sector: string | null;
  exchange: string | null;
  country: string | null;
  website: string | null;
  isDelisted: boolean;
  inDtCoverage: boolean;
};

export function parseCompanyProfile(body: CompanyProfileBody): DtProfile | null {
  if (!body || typeof body !== 'object') return null;
  return {
    companyName: body.companyName || null,
    description: body.description || null,
    industry: body.industry || null,
    sector: body.sector || null,
    exchange: body.exchange || null,
    country: body.country || null,
    website: body.website || null,
    isDelisted: body.isDelisted === true,
    inDtCoverage: body.inDtCoverage === true,
  };
}

const cachedProfile = unstable_cache(
  async (ticker: string) =>
    loadDt<CompanyProfileBody>(`/v2/company/profile/${encodeURIComponent(ticker)}`),
  ['dilutiontracker-profile'],
  { revalidate: DAY_SECONDS }
);

export async function fetchDtCompanyProfile(ticker: string): Promise<DtResult<DtProfile>> {
  const symbol = normalizeTicker(ticker);
  if (!symbol) return { status: 'not_found' };
  const result = await settle(() => cachedProfile(symbol));
  if (result.status !== 'ok') return result;
  const parsed = parseCompanyProfile(result.data);
  return parsed ? { status: 'ok', data: parsed } : { status: 'not_found' };
}

// ---------------------------------------------------------------------------
// Major developments ("Our Take" articles; uncapped on complimentary; cached 6h)
// ---------------------------------------------------------------------------

type MajorDevelopmentBody = {
  _id?: string;
  publishedDatetime?: string;
  bodyText?: string;
  ticker?: string;
};

export type DtDevelopment = {
  id: string;
  publishedAt: string;
  text: string;
};

/** Newest first, up to `limit` items. Drops entries without an id, date, or text. */
export function parseDevelopments(body: MajorDevelopmentBody[], limit = 5): DtDevelopment[] {
  if (!Array.isArray(body)) return [];
  return body
    .filter((d) => d && d._id && d.publishedDatetime && d.bodyText)
    .map((d) => ({
      id: String(d._id),
      publishedAt: new Date(d.publishedDatetime as string).toISOString(),
      text: String(d.bodyText),
    }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit);
}

const cachedDevelopments = unstable_cache(
  async (ticker: string) =>
    loadDt<MajorDevelopmentBody[]>(`/v2/major-developments/${encodeURIComponent(ticker)}`),
  ['dilutiontracker-developments'],
  { revalidate: 6 * 60 * 60 }
);

export async function fetchDtMajorDevelopments(
  ticker: string
): Promise<DtResult<DtDevelopment[]>> {
  const symbol = normalizeTicker(ticker);
  if (!symbol) return { status: 'not_found' };
  const result = await settle(() => cachedDevelopments(symbol));
  if (result.status !== 'ok') return result;
  return { status: 'ok', data: parseDevelopments(result.data) };
}
