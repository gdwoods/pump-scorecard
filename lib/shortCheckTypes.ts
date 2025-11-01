// lib/shortCheckTypes.ts
// Shared types for Short Check feature (no server-only imports)

export interface ExtractedData {
  ticker?: string;
  cashOnHand?: number; // in dollars
  quarterlyBurnRate?: number; // in dollars (negative for burn, positive for cash flow)
  cashRunway?: number; // in months
  float?: number; // in shares
  marketCap?: number; // in dollars
  outstandingShares?: number; // in shares
  outstandingShares3YearsAgo?: number; // in shares (for historical dilution calculation)
  historicalOSSource?: 'yahoo-finance' | 'sec' | 'unknown'; // source of historical O/S data
  atmShelfStatus?: string; // e.g., "ATM Active", "S-1 Filed", or "DT:Medium" for DT tags
  overheadSupplyStatus?: string; // e.g., "DT:Medium", "DT:High", "DT:Low" for DT tags
  cashNeedStatus?: string; // e.g., "DT:High", "DT:Medium", "DT:Low" for DT tags
  historicalDilutionStatus?: string; // e.g., "DT:High", "DT:Medium", "DT:Low" for DT tags
  overallRiskStatus?: string; // e.g., "DT:High", "DT:Medium", "DT:Low" for DT tags
  debt?: number; // in dollars
  hasActualDebtData?: boolean; // true if debt was explicitly found (not inferred from net cash)
  debtCashSource?: 'ocr' | 'yahoo-finance' | 'manual'; // source of debt/cash data
  institutionalOwnership?: number; // percentage (0-100)
  shortInterest?: number; // percentage (0-100)
  priceSpike?: boolean; // indicator from chart context
  priceSpikePct?: number; // percentage change from DT screenshot (e.g., 18.18%, 20.51%)
  recentNews?: string; // news headline or "None"
  recentNewsDate?: string; // ISO date string for recency weighting
  confidence: number; // overall confidence score (0-1)
}

