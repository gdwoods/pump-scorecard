import type { CapitalPressureResult } from './types';
import type { ExtractedData } from '../shortCheckTypes';

/** Soft cross-check between DilutionTracker OCR offering tags and SEC Capital Pressure. */
export function detectOfferingDisagreement(
  extracted?: ExtractedData | null,
  capitalPressure?: CapitalPressureResult | null
): string | null {
  if (!extracted?.atmShelfStatus || !capitalPressure?.available) return null;

  const status = extracted.atmShelfStatus.toLowerCase();
  const dtLow =
    status.includes('dt:green') ||
    status.includes('dt:low') ||
    status === 'none' ||
    status.includes('green');
  const dtHigh =
    status.includes('dt:red') ||
    status.includes('dt:high') ||
    status.includes('atm active') ||
    status.includes('equity line') ||
    status.includes('active');

  const secActiveFinancing = capitalPressure.reasons.some(
    (r) =>
      /ATM|ELOC|equity line|Registered direct|shelf/i.test(r.label) && r.points > 0
  );
  const secQuiet =
    capitalPressure.score < 25 &&
    !capitalPressure.reasons.some((r) =>
      /ATM|ELOC|equity line|Registered direct|shelf/i.test(r.label)
    );

  if (dtLow && secActiveFinancing) {
    return 'DilutionTracker offering looks low/green, but SEC Capital Pressure found documented financing capacity or share-supply activity. Verify the linked filings.';
  }
  if (dtHigh && secQuiet) {
    return 'DilutionTracker flags active offering ability, but SEC Capital Pressure did not verify matching capacity in the scanned window. Confirm on EDGAR / DT.';
  }
  return null;
}

/** One-line SEC bridge for Short Check risk synopsis area. */
export function capitalPressureShortCheckNote(
  capitalPressure?: CapitalPressureResult | null
): string | null {
  if (!capitalPressure?.available) return null;
  const top = capitalPressure.reasons[0];
  if (!top) {
    return `SEC Capital Pressure: ${capitalPressure.score}/100 (${capitalPressure.status}) — no automatic score reasons verified.`;
  }
  return `SEC Capital Pressure: ${capitalPressure.score}/100 (${capitalPressure.status}). Top evidence: ${top.label} (+${top.points}).`;
}
