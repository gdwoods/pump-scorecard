import type { OperatingNexus } from './detectOperatingNexus';
import { shouldRunOperatingNexus } from './locales';
import type { NexusApiResponse, NexusApiStatus } from './types';

export type BuildNexusApiInput = {
  ticker: string;
  country?: string | null;
  /** When true, SEC context could not be loaded or filings were unavailable. */
  secUnavailable?: boolean;
  /** Filings were selected but HTML could not be retrieved. */
  documentsUnavailable?: boolean;
  operatingNexus?: OperatingNexus | null;
};

export function buildNexusApiResponse(input: BuildNexusApiInput): NexusApiResponse {
  const ticker = input.ticker.toUpperCase();

  let status: NexusApiStatus;
  let overseas = false;
  let countries: string[] = [];
  let reason = '';
  let evidenceUrl: string | null = null;
  let asOf: string | null = null;

  if (input.secUnavailable) {
    status = 'unknown';
    reason = 'SEC filing index could not be loaded for this ticker.';
  } else if (input.country && !shouldRunOperatingNexus(input.country)) {
    status = 'not_applicable';
    reason =
      'Operating nexus applies to US domiciles and watched offshore/Asia domiciles; this issuer falls outside that set.';
  } else if (input.documentsUnavailable) {
    status = 'unknown';
    reason = 'Could not load the latest annual report or proxy from SEC.';
  } else if (input.operatingNexus?.headline) {
    status = 'flagged';
    overseas = true;
    countries = [...(input.operatingNexus.places || [])];
    reason = input.operatingNexus.headline;
    const evidence = input.operatingNexus.evidence || [];
    if (evidence.length > 0) {
      evidenceUrl = evidence[0].documentUrl || null;
      asOf = evidence.reduce((latest, item) => {
        if (!item.filingDate) return latest;
        if (!latest || item.filingDate > latest) return item.filingDate;
        return latest;
      }, evidence[0].filingDate || null);
    }
  } else {
    status = 'clear';
    reason = 'No overseas operating or control nexus detected in the latest annual report or proxy.';
  }

  return {
    ticker,
    overseas,
    countries,
    reason,
    evidenceUrl,
    asOf,
    status,
  };
}