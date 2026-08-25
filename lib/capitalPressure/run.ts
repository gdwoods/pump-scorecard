/**
 * Orchestrates Capital Pressure: index filings → fetch/parse → score.
 * Designed to run inside the scan route without failing the overall scan.
 */

import {
  buildDocumentUrl,
  fetchDocumentText,
  fetchSecJson,
  fetchXbrlSnapshot,
  indexCapitalPressureFilings,
  padCik,
  selectFilingsToFetch,
  toFilingDocumentInput,
  type IndexedFiling,
} from './edgar';
import { parseCapitalPressureDocuments } from './parse';
import { scoreCapitalPressure } from '../capitalPressureScoring';
import type {
  CapitalPressureResult,
  CapitalPressureScanContext,
  FilingDocumentInput,
} from './types';

const DEFAULT_FETCH_BUDGET_MS = 12_000;

type SubmissionsJson = {
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
      accessionNumber?: string[];
      primaryDocument?: string[];
      items?: string[];
    };
  };
};

export type RunCapitalPressureArgs = {
  ticker: string;
  /** Pre-resolved CIK (padded or not). If omitted, looked up by ticker. */
  cik?: string | null;
  /** Optional pre-fetched submissions JSON to avoid a second network call. */
  submissions?: SubmissionsJson | null;
  context?: CapitalPressureScanContext;
  fetchBudgetMs?: number;
};

async function resolveCik(ticker: string): Promise<string | null> {
  const json = await fetchSecJson<Record<string, { ticker?: string; cik_str?: number }>>(
    'https://www.sec.gov/files/company_tickers.json'
  );
  if (!json) return null;
  const upper = ticker.toUpperCase();
  const entry = Object.values(json).find((c) => c.ticker?.toUpperCase() === upper);
  if (!entry?.cik_str) return null;
  return padCik(entry.cik_str);
}

/**
 * Full Capital Pressure pipeline for a ticker. Never throws — returns unavailable on failure.
 */
export async function runCapitalPressure(
  args: RunCapitalPressureArgs
): Promise<CapitalPressureResult> {
  const asOf = args.context?.asOf || new Date().toISOString().slice(0, 10);
  const budgetMs = args.fetchBudgetMs ?? DEFAULT_FETCH_BUDGET_MS;
  const started = Date.now();

  try {
    let cik = args.cik ? padCik(args.cik) : null;
    if (!cik) {
      cik = await resolveCik(args.ticker);
    }
    if (!cik) {
      return scoreCapitalPressure({
        unavailableReason: 'CIK not found for ticker',
        context: { ...args.context, asOf },
      });
    }

    let submissions = args.submissions;
    if (!submissions) {
      submissions = await fetchSecJson<SubmissionsJson>(
        `https://data.sec.gov/submissions/CIK${cik}.json`
      );
    }
    if (!submissions?.filings?.recent) {
      return {
        ...scoreCapitalPressure({
          unavailableReason: 'SEC submissions unavailable',
          context: { ...args.context, asOf },
        }),
        cik,
        edgarSearchUrl: `https://www.sec.gov/edgar/browse/?CIK=${cik.replace(/^0+/, '')}`,
      };
    }

    const { filings, windowStart, windowEnd, registrationWindowStart } =
      indexCapitalPressureFilings(cik, submissions.filings.recent, { asOf });

    const toFetch = selectFilingsToFetch(filings);
    const docs: FilingDocumentInput[] = [];
    let partial = false;

    for (const filing of toFetch) {
      if (Date.now() - started > budgetMs) {
        partial = true;
        break;
      }
      const text = await fetchDocumentText(filing.documentUrl);
      if (!text) {
        partial = true;
        continue;
      }
      docs.push(toFilingDocumentInput(filing, text));
    }

    // XBRL snapshot (best-effort; skip if budget exhausted)
    let xbrl;
    if (Date.now() - started < budgetMs) {
      try {
        xbrl = await fetchXbrlSnapshot(cik);
      } catch {
        partial = true;
      }
    } else {
      partial = true;
    }

    const parsed = parseCapitalPressureDocuments(docs, {
      windowStart,
      windowEnd,
      xbrl,
      partial,
      asOf,
      parseNotes: partial ? ['Parse budget limited'] : undefined,
    });

    // Attach shares-outstanding evidence from XBRL when present
    if (xbrl?.sharesOutstanding !== undefined) {
      parsed.fundamentals.sharesOutstandingEvidence = {
        form: 'XBRL',
        filingDate: xbrl.sharesOutstandingAsOf || '',
        documentUrl: `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/EntityCommonStockSharesOutstanding.json`,
        excerpt: `EntityCommonStockSharesOutstanding: ${xbrl.sharesOutstanding.toLocaleString()} as of ${xbrl.sharesOutstandingAsOf || 'unknown'}`,
        confidence: 'high',
      };
    }

    const result = scoreCapitalPressure({
      parsed,
      context: { ...args.context, asOf },
    });

    return {
      ...result,
      cik,
      edgarSearchUrl: `https://www.sec.gov/edgar/browse/?CIK=${cik.replace(/^0+/, '')}`,
      filingsScanned: docs.length,
      registrationWindowStart,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return scoreCapitalPressure({
      unavailableReason: `SEC capital-pressure lookup failed: ${message}`,
      context: { ...args.context, asOf },
    });
  }
}

/** Build IndexedFiling list from a raw submissions.recent object (test/helper). */
export function indexFromSubmissions(
  cik: string,
  recent: NonNullable<NonNullable<SubmissionsJson['filings']>['recent']>,
  asOf?: string
): IndexedFiling[] {
  return indexCapitalPressureFilings(cik, recent, { asOf }).filings;
}

export { buildDocumentUrl, padCik };
