import { buildDocumentUrl, SEC_USER_AGENT } from '../capitalPressure/edgar';
import { detectOperatingNexus, type OperatingNexus } from './detectOperatingNexus';
import { isUsListedCountry } from './locales';

const FETCH_TIMEOUT_MS = 5000;
const MAX_CHARS = 6_000_000;

const ANNUAL_BASE = ['10-K', '20-F', '40-F'];
const ANNUAL_AMEND = ['10-K/A', '20-F/A', '40-F/A'];
const QUARTERLY = ['10-Q', '10-Q/A'];
const PROXY = ['DEF 14A', 'DEF 14C'];

type RecentFilings = {
  form?: string[];
  filingDate?: string[];
  accessionNumber?: string[];
  primaryDocument?: string[];
};

export type NexusFilingRef = {
  form: string;
  filingDate: string;
  documentUrl: string;
};

function latestFiling(
  cik: string,
  recent: RecentFilings,
  forms: string[]
): NexusFilingRef | null {
  const allowed = new Set(forms);
  let best: NexusFilingRef | null = null;
  const filed = recent.form || [];
  for (let i = 0; i < filed.length; i++) {
    const form = (filed[i] || '').toUpperCase();
    if (!allowed.has(form)) continue;
    const filingDate = recent.filingDate?.[i] || '';
    const accessionNumber = recent.accessionNumber?.[i] || '';
    const primaryDocument = recent.primaryDocument?.[i] || '';
    if (!filingDate || !accessionNumber || !primaryDocument) continue;
    if (best && filingDate <= best.filingDate) continue;
    best = {
      form,
      filingDate,
      documentUrl: buildDocumentUrl(cik, accessionNumber, primaryDocument),
    };
  }
  return best;
}

/** Latest annual report (10-K before a newer 10-Q) and the latest definitive proxy. */
export function selectNexusFilings(
  cik: string | null | undefined,
  submissions?: { filings?: { recent?: RecentFilings } } | null
): NexusFilingRef[] {
  const recent = submissions?.filings?.recent;
  if (!cik || !recent?.form?.length) return [];
  const annual =
    latestFiling(cik, recent, ANNUAL_BASE) ||
    latestFiling(cik, recent, ANNUAL_AMEND) ||
    latestFiling(cik, recent, QUARTERLY);
  const proxy = latestFiling(cik, recent, PROXY);
  return [annual, proxy].filter((filing): filing is NexusFilingRef => Boolean(filing));
}

async function fetchFilingText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': SEC_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,text/plain',
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length > MAX_CHARS) return null;
    return text;
  } catch (err) {
    console.warn('[operating-nexus] filing fetch failed', url, err);
    return null;
  }
}

export async function fetchOperatingNexus(args: {
  country?: string | null;
  cik?: string | null;
  submissions?: { filings?: { recent?: RecentFilings } } | null;
}): Promise<OperatingNexus | null> {
  if (!isUsListedCountry(args.country)) return null;
  const filings = selectNexusFilings(args.cik, args.submissions);
  if (filings.length === 0) return null;

  const docs = (
    await Promise.all(
      filings.map(async (filing) => {
        const text = await fetchFilingText(filing.documentUrl);
        if (!text) return null;
        return { ...filing, text };
      })
    )
  ).filter((doc): doc is NexusFilingRef & { text: string } => Boolean(doc));

  if (docs.length === 0) return null;
  return detectOperatingNexus(docs);
}
