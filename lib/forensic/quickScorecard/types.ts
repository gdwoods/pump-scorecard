// lib/forensic/quickScorecard/types.ts

export type ScoreConfidence = 'verified' | 'estimated' | 'stale' | 'unknown';

export type QuickScoreKey =
  | 'combined'
  | 'offering'
  | 'cashNeed'
  | 'delisting'
  | 'survivalPump'
  | 'squeeze';

export interface QuickScoreMetric {
  key: QuickScoreKey;
  label: string;
  value: number | null;
  /** 0–10 when value is set. */
  band: 'low' | 'moderate' | 'elevated' | 'high' | 'extreme' | 'unknown';
  confidence: ScoreConfidence;
  summary: string;
}

export interface QuickScorecard {
  ticker: string;
  asOf: string;
  combined: QuickScoreMetric;
  offering: QuickScoreMetric;
  cashNeed: QuickScoreMetric;
  delisting: QuickScoreMetric;
  survivalPump: QuickScoreMetric;
  squeeze: QuickScoreMetric;
  /** Effective shelf + cash need + recent draw behavior. */
  offeringTrap: boolean;
  offeringTrapSummary?: string;
}

export interface QuickScorecardCapitalPressureSlice {
  available?: boolean;
  score?: number;
  status?: string;
  dilutionLikelihood?: number;
  shortExecutionRisk?: number;
  recentIssuance?: {
    shares30d?: number;
    shares90d?: number;
    status?: string;
  };
  events?: Array<{ type: string; eventDate?: string; isRetrospective?: boolean }>;
  upcomingReverseSplit?: { effectiveDate?: string; ratio?: string; summary?: string } | null;
  reasons?: Array<{ label: string; points: number }>;
}

export interface QuickScorecardInput {
  ticker: string;
  now?: string;
  fastVerdict?: {
    verdict?: string;
    runnerClass?: string;
    derivedOfferingAbility?: string;
    babyShelfCapacity?: number | null;
    capacityQuarters?: number | null;
    atmDetected?: boolean | null;
    borrowAvailable?: boolean | null;
    borrowFeePct?: number | null;
    priorDayPct?: number | null;
    threeDayRunPct?: number | null;
    dataCompleteness?: number;
  };
  fundamentals?: {
    float?: number | null;
    marketCap?: number | null;
    shortInterest?: number | null;
    runwayMonths?: number | null;
    instOwn?: number | null;
  };
  capitalPressure?: QuickScorecardCapitalPressureSlice | null;
  shortCheck?: {
    rating?: number;
    /** Short Check cash-need component (0–25). */
    cashNeedPoints?: number;
  };
  droppinessScore?: number | null;
}
