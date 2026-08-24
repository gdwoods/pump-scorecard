import type { CapitalPressureResult } from './types';

/** Neutral unavailable object — never a negative/high-risk signal. */
export function unavailableCapitalPressure(
  reason: string,
  scannedThrough?: string
): CapitalPressureResult {
  const now = scannedThrough || new Date().toISOString();
  return {
    available: false,
    unavailableReason: reason,
    score: 0,
    status: 'low',
    dilutionLikelihood: 0,
    shortExecutionRisk: 0,
    summary:
      'Capital pressure could not be verified from SEC filings. Missing data is unavailable, not a risk signal.',
    reasons: [],
    unknowns: [
      'SEC filings unavailable — going concern not verified',
      'Cash runway not verified',
      'Working capital not verified',
      'ATM / equity line / shelf capacity not verified',
      'Recent issuance not verified',
      'Shares outstanding not verified from filings',
    ],
    capacity: {
      status: 'unknown',
      description: 'Not verified from available filings',
    },
    recentIssuance: { status: 'unknown' },
    sharesOutstanding: { status: 'unknown' },
    events: [],
    scannedThrough: now,
  };
}
