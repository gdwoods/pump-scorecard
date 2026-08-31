// lib/forensic/quickScorecard/metricTooltips.ts
//
// UI tooltip copy for Quick Scorecard metrics (0–10 filing-first derivatives).

import type { QuickScoreKey, ScoreConfidence } from './types';

export const QUICK_SCORECARD_HEADER_TOOLTIP =
  'Six orthogonal 0–10 risk axes derived from SEC filings, Capital Pressure, and scan data. Independent scores — screening aid only, not trade authorization.';

export const QUICK_SCORE_BAND_TOOLTIP =
  'Scale: 0–2 low · 3–5 moderate · 6–7 elevated · 8–9 high · 10 extreme.';

export const QUICK_SCORE_METRIC_TOOLTIPS: Record<QuickScoreKey, string> = {
  combined:
    'Intersection-weighted runner risk — the max of offering, delisting, survival-pump, and squeeze, with boosts when cash need + offering ability or delisting + squeeze align. Not a simple average.',
  offering:
    'Likelihood the issuer can dilute via shelf, ATM, S-1, or similar. Uses Capital Pressure dilution likelihood when available; otherwise Fast Verdict offering ability.',
  cashNeed:
    'How urgently the company may need outside capital — from runway months, Short Check cash-need points, or baby-shelf capacity quarters.',
  delisting:
    'Nasdaq listing risk from deficiency notices, reverse splits, and upcoming split events in the Capital Pressure filing window.',
  survivalPump:
    'Structural incentive for price support when listing pressure, cash need, and dilution ability overlap. Risk classification only — not an allegation of manipulation.',
  squeeze:
    'Short-squeeze / low-float execution risk: thin float, runner class, borrow availability, and short interest. Maps from Capital Pressure short-execution risk when available.',
};

export const QUICK_SCORE_CONFIDENCE_TOOLTIPS: Record<ScoreConfidence, string> = {
  verified: 'Grounded in SEC filing evidence or Capital Pressure verified sub-scores.',
  estimated: 'Inferred from scan estimates, Fast Verdict, or partial inputs.',
  stale: 'Source data may be outdated — treat as directional only.',
  unknown: 'Required inputs missing — score not computed or provisional.',
};

export const OFFERING_TRAP_TOOLTIP =
  'High offering ability + acute cash need + active or recent draw on a financing channel (ATM, shelf draw, ELOC, etc.). Flags a common dilution setup — not a timing call.';
