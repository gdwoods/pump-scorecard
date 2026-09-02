import type { CapitalEvent, EventCertainty } from './types';

/** Filed = registered capacity / filing only. Issued = verified shares sold or converted. */
export type EventIssuanceStatus = 'filed' | 'issued';

export type { EventCertainty };

const ISSUANCE_TYPES = new Set([
  'registered_direct',
  'private_placement',
  'note_conversion',
  'debt_for_equity',
  'warrant_exercise',
  'prospectus_supplement',
  'equity_line',
  'atm_program',
]);

export function getEventIssuanceStatus(event: CapitalEvent): EventIssuanceStatus | null {
  if (event.isCapacityOnly) return 'filed';

  const hasIssuedShares =
    event.sharesIssued != null && Number.isFinite(event.sharesIssued) && event.sharesIssued > 0;
  const hasProceeds =
    event.grossProceedsUsd != null && Number.isFinite(event.grossProceedsUsd) && event.grossProceedsUsd > 0;

  if (hasIssuedShares || hasProceeds) return 'issued';
  if (ISSUANCE_TYPES.has(event.type)) return 'issued';

  if (event.type === 'shelf_registration' || (event.potentialShares != null && !hasIssuedShares)) {
    return 'filed';
  }
  return null;
}

export function issuanceStatusLabel(status: EventIssuanceStatus): string {
  return status === 'issued' ? 'Issued' : 'Filed';
}

export function issuanceStatusTip(status: EventIssuanceStatus): string {
  return status === 'issued'
    ? 'Shares sold or converted — proceeds may have landed.'
    : 'Registered or filed capacity — not confirmed issuance.';
}

/** Share count used for % of float (issued shares preferred, then potential). */
export function eventShareCountForFloat(event: CapitalEvent): number | null {
  if (event.sharesIssued != null && Number.isFinite(event.sharesIssued) && event.sharesIssued > 0) {
    return event.sharesIssued;
  }
  if (event.potentialShares != null && Number.isFinite(event.potentialShares) && event.potentialShares > 0) {
    return event.potentialShares;
  }
  return null;
}

export function computePercentOfFloat(
  shareCount: number | null | undefined,
  floatShares: number | null | undefined
): number | null {
  if (
    shareCount == null ||
    floatShares == null ||
    !Number.isFinite(shareCount) ||
    !Number.isFinite(floatShares) ||
    floatShares <= 0 ||
    shareCount <= 0
  ) {
    return null;
  }
  return (shareCount / floatShares) * 100;
}

export function formatPercentOfFloat(pct: number | null | undefined): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct >= 100) return `${pct.toFixed(0)}% of float`;
  if (pct >= 10) return `${pct.toFixed(1)}% of float`;
  return `${pct.toFixed(2)}% of float`;
}

export function eventPercentOfFloat(
  event: CapitalEvent,
  floatShares: number | null | undefined
): string | null {
  const shares = eventShareCountForFloat(event);
  if (shares == null) return null;
  return formatPercentOfFloat(computePercentOfFloat(shares, floatShares));
}

export function certaintyLabel(certainty: EventCertainty): string {
  return certainty === 'set' ? 'Set' : 'Possible';
}

export function certaintyTip(certainty: EventCertainty): string {
  return certainty === 'set'
    ? 'Confirmed date or mechanism from filing.'
    : 'Contingent — may not occur (e.g. optional redemption, pending approval).';
}
