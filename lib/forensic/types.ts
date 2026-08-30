import type { TaggedClaim } from '@/lib/claims';
import type { QuickScorecard } from './quickScorecard/types';

export const FORENSIC_FACT_PACK_VERSION = 'forensic-fact-pack-v1';

export interface ForensicRubricRow {
  label: string;
  value: string;
  tag?: TaggedClaim['tag'];
}

export interface ForensicSnapshot {
  price?: number;
  marketCap?: number;
  floatShares?: number;
  sharesOutstanding?: number;
  institutionalOwnership?: number;
  shortFloat?: number;
  droppinessScore?: number;
  capitalPressureScore?: number;
  capitalPressureStatus?: string;
  fastVerdict?: string;
  shortCheckRating?: number;
  shortCheckCategory?: string;
}

export interface ForensicFactPack {
  version: typeof FORENSIC_FACT_PACK_VERSION;
  ticker: string;
  asOf: string;
  alerts: TaggedClaim[];
  conflicts: TaggedClaim[];
  snapshot: ForensicSnapshot;
  rubric: ForensicRubricRow[];
  dataGaps: TaggedClaim[];
  /** JSON-safe summary for prompt injection. */
  notes: string[];
  /** Orthogonal 0–10 runner risk scores (filing-first derivatives). */
  quickScorecard?: QuickScorecard;
}
