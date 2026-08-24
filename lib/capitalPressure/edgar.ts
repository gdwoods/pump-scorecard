/**
 * Thin EDGAR helpers for Capital Pressure.
 * Network I/O only — parsing/scoring stay pure.
 */

import type { FilingDocumentInput, XbrlSnapshot } from './types';

export const SEC_USER_AGENT = 'pump-scorecard (garthwoods@gmail.com)';

export const CAPITAL_PRESSURE_FORMS = new Set([
  '8-K',
  '8-K/A',
  '6-K',
  '6-K/A',
  '10-Q',
  '10-Q/A',
  '10-K',
  '10-K/A',
  'S-1',
  'S-1/A',
  'S-3',
  'S-3/A',
  'S-3ASR',
  'F-1',
  'F-1/A',
  'F-3',
  'F-3/A',
  '424B3',
  '424B5',
  '424B7',
  '424B8',
]);

export type SubmissionsFiling = {
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string;
  items?: string;
};

export type IndexedFiling = SubmissionsFiling & {
  cik: string;
  documentUrl: string;
};

const EIGHT_K_ITEMS = new Set(['1.01', '2.03', '3.01', '3.02', '3.03', '5.03', '8.01']);

export function padCik(cik: string | number): string {
  return String(cik).replace(/^0+/, '').padStart(10, '0');
}

export function buildDocumentUrl(
  cik: string,
  accessionNumber: string,
  primaryDocument: string
): string {
  const bareCik = String(cik).replace(/^0+/, '');
  const acc = accessionNumber.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${bareCik}/${acc}/${primaryDocument}`;
}

export function monthsAgoIso(months: number, asOf = new Date()): string {
  const d = new Date(asOf);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** Index relevant forms from submissions.recent within a 24-month window. */
export function indexCapitalPressureFilings(
  cik: string,
  recent: {
    form?: string[];
    filingDate?: string[];
    accessionNumber?: string[];
    primaryDocument?: string[];
    items?: string[];
  },
  opts?: { asOf?: string; windowMonths?: number }
): { filings: IndexedFiling[]; windowStart: string; windowEnd: string } {
  const asOf = opts?.asOf ? new Date(opts.asOf) : new Date();
  const windowMonths = opts?.windowMonths ?? 24;
  const windowStart = monthsAgoIso(windowMonths, asOf);
  const windowEnd = asOf.toISOString().slice(0, 10);
  const forms = recent.form || [];
  const filings: IndexedFiling[] = [];

  for (let i = 0; i < forms.length; i++) {
    const form = (forms[i] || '').toUpperCase();
    const filingDate = recent.filingDate?.[i] || '';
    if (!filingDate || filingDate < windowStart) continue;
    if (!isRelevantForm(form)) continue;
    const accessionNumber = recent.accessionNumber?.[i] || '';
    const primaryDocument = recent.primaryDocument?.[i] || '';
    if (!accessionNumber || !primaryDocument) continue;
    filings.push({
      form,
      filingDate,
      accessionNumber,
      primaryDocument,
      items: recent.items?.[i],
      cik: padCik(cik),
      documentUrl: buildDocumentUrl(cik, accessionNumber, primaryDocument),
    });
  }

  filings.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  return { filings, windowStart, windowEnd };
}

function isRelevantForm(form: string): boolean {
  if (CAPITAL_PRESSURE_FORMS.has(form)) return true;
  if (form.startsWith('424B')) return true;
  if (form.startsWith('S-3') || form.startsWith('S-1')) return true;
  if (form.startsWith('F-3') || form.startsWith('F-1')) return true;
  return false;
}

/** Select a bounded set of filings to fetch/parse (newest first). */
export function selectFilingsToFetch(
  filings: IndexedFiling[],
  caps: { prospectus?: number; eightK?: number } = {}
): IndexedFiling[] {
  const prospectusCap = caps.prospectus ?? 8;
  const eightKCap = caps.eightK ?? 12;
  const selected: IndexedFiling[] = [];
  const seen = new Set<string>();

  const push = (f: IndexedFiling) => {
    const key = f.accessionNumber;
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(f);
  };

  // Always latest 10-Q or 10-K
  const periodic = filings.find((f) =>
    f.form.startsWith('10-Q') || f.form.startsWith('10-K')
  );
  if (periodic) push(periodic);

  // All registration statements in window
  for (const f of filings) {
    if (
      f.form.startsWith('S-1') ||
      f.form.startsWith('S-3') ||
      f.form.startsWith('F-1') ||
      f.form.startsWith('F-3')
    ) {
      push(f);
    }
  }

  // Recent prospectus supplements
  let prospectusCount = 0;
  for (const f of filings) {
    if (f.form.startsWith('424B') && prospectusCount < prospectusCap) {
      push(f);
      prospectusCount++;
    }
  }

  // 8-K / 6-K with relevant items (or unknown items — still include up to cap)
  let eightKCount = 0;
  for (const f of filings) {
    if (!(f.form.startsWith('8-K') || f.form.startsWith('6-K'))) continue;
    if (eightKCount >= eightKCap) break;
    if (f.items && !hasRelevantEightKItem(f.items)) continue;
    push(f);
    eightKCount++;
  }

  return selected;
}

function hasRelevantEightKItem(items: string): boolean {
  return [...EIGHT_K_ITEMS].some((item) => items.includes(item));
}

export async function fetchSecJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchDocumentText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': SEC_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,text/plain',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

type CompanyConcept = {
  units?: Record<string, Array<{ val?: number; end?: string; start?: string; filed?: string }>>;
};

function latestConceptValue(
  concept: CompanyConcept | null,
  unitKeys: string[]
): { value?: number; asOf?: string } {
  if (!concept?.units) return {};
  let best: { value: number; asOf: string } | null = null;
  for (const key of unitKeys) {
    const entries = concept.units[key];
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (e.val === undefined || e.val === null || !e.end) continue;
      if (!best || e.end > best.asOf) {
        best = { value: Number(e.val), asOf: e.end };
      }
    }
  }
  return best ? { value: best.value, asOf: best.asOf } : {};
}

/** Fetch a small XBRL snapshot for cash / WC / O/S. Missing tags stay undefined. */
export async function fetchXbrlSnapshot(cik: string): Promise<XbrlSnapshot> {
  const padded = padCik(cik);
  const base = `https://data.sec.gov/api/xbrl/companyconcept/CIK${padded}`;

  const [cash, ocf, ca, cl, assets, shares] = await Promise.all([
    fetchSecJson<CompanyConcept>(`${base}/us-gaap/CashAndCashEquivalentsAtCarryingValue.json`),
    fetchSecJson<CompanyConcept>(`${base}/us-gaap/NetCashProvidedByUsedInOperatingActivities.json`),
    fetchSecJson<CompanyConcept>(`${base}/us-gaap/AssetsCurrent.json`),
    fetchSecJson<CompanyConcept>(`${base}/us-gaap/LiabilitiesCurrent.json`),
    fetchSecJson<CompanyConcept>(`${base}/us-gaap/Assets.json`),
    fetchSecJson<CompanyConcept>(
      `${base}/us-gaap/EntityCommonStockSharesOutstanding.json`
    ),
  ]);

  const cashV = latestConceptValue(cash, ['USD']);
  const ocfV = latestConceptValue(ocf, ['USD']);
  const caV = latestConceptValue(ca, ['USD']);
  const clV = latestConceptValue(cl, ['USD']);
  const assetsV = latestConceptValue(assets, ['USD']);
  const sharesV = latestConceptValue(shares, ['shares', 'pure', 'units']);

  const snapshot: XbrlSnapshot = {};
  if (cashV.value !== undefined) {
    snapshot.cashUsd = cashV.value;
    snapshot.cashAsOf = cashV.asOf;
  }
  if (ocfV.value !== undefined) {
    snapshot.operatingCashFlowUsd = ocfV.value;
    snapshot.ocfAsOf = ocfV.asOf;
  }
  if (caV.value !== undefined) snapshot.currentAssetsUsd = caV.value;
  if (clV.value !== undefined) snapshot.currentLiabilitiesUsd = clV.value;
  if (assetsV.value !== undefined) {
    snapshot.totalAssetsUsd = assetsV.value;
    snapshot.balanceSheetAsOf = assetsV.asOf || caV.asOf || clV.asOf;
  }
  if (sharesV.value !== undefined) {
    snapshot.sharesOutstanding = sharesV.value;
    snapshot.sharesOutstandingAsOf = sharesV.asOf;
  }
  return snapshot;
}

export function toFilingDocumentInput(
  filing: IndexedFiling,
  text: string
): FilingDocumentInput {
  return {
    form: filing.form,
    filingDate: filing.filingDate,
    accessionNumber: filing.accessionNumber,
    documentUrl: filing.documentUrl,
    text,
    items: filing.items ? filing.items.split(',').map((s) => s.trim()) : undefined,
  };
}
