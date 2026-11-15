import { SEC_USER_AGENT } from '../capitalPressure/edgar';
import { parseSecAddress } from '@/utils/normalizeCountry';

export type SecContext = {
  cik: string;
  country: string | null;
  submissions: {
    filings?: { recent?: Record<string, string[] | string | undefined> };
    addresses?: { business?: unknown; mailing?: unknown };
  };
};

type CikEntry = { ticker?: string; cik_str?: number };

const TICKER_JSON_URL = 'https://www.sec.gov/files/company_tickers.json';

export async function fetchSecContext(ticker: string): Promise<SecContext | null> {
  const upper = ticker.toUpperCase();
  try {
    const cikRes = await fetch(TICKER_JSON_URL, {
      headers: { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!cikRes.ok) return null;

    const cikJson = (await cikRes.json()) as Record<string, CikEntry>;
    const entry = Object.values(cikJson).find((c) => c.ticker?.toUpperCase() === upper);
    if (!entry?.cik_str) return null;

    const cik = entry.cik_str.toString().padStart(10, '0');
    const secRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!secRes.ok) return null;

    const submissions = await secRes.json();
    const biz = parseSecAddress(submissions?.addresses?.business);
    const secCountry =
      biz?.country && biz.country !== 'Unknown' ? biz.country.trim() : null;

    return { cik, country: secCountry, submissions };
  } catch (err) {
    console.warn('[nexus] sec context failed', upper, err);
    return null;
  }
}

/** Pause between SEC filing downloads to stay under fair-access limits. */
export function secThrottleMs(): number {
  const raw = process.env.NEXUS_SEC_THROTTLE_MS?.trim();
  if (!raw) return 250;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 250;
}

export async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}