// lib/config/features.ts
/** Fast Scan: ticker-only path — keep off until burn/droppiness enrichment is wired. */
export const SHOW_FAST_VERDICT_UI = false;

/** Short Check: show Fast verdict card after DT/manual analyze (enriched with scan + OCR). */
export const SHOW_FAST_VERDICT_ON_SHORT_CHECK = true;

/**
 * Disabled-by-default: do not fold Capital Pressure into the weighted Pump Scorecard
 * overall score until manual filing review is complete.
 */
export const INCLUDE_CAPITAL_PRESSURE_IN_OVERALL_SCORE = false;
