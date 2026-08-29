// lib/config/features.ts
/** Fast Scan: ticker-only path with burn, droppiness, and scan enrichment. */
export const SHOW_FAST_VERDICT_UI = true;

/** Short Check: show Fast verdict card after DT/manual analyze (enriched with scan + OCR). */
export const SHOW_FAST_VERDICT_ON_SHORT_CHECK = true;

/** Fold SEC Capital Pressure into Pump Scorecard headline score (capped). */
export const INCLUDE_CAPITAL_PRESSURE_IN_OVERALL_SCORE = true;

/** On-demand AI thesis synthesis (Groq). Requires GROQ_API_KEY server-side. */
export const SHOW_AI_THESIS = true;
