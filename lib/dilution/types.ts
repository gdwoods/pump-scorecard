import type { FastVerdict, FastVerdictKind, NewsClass, OfferingAbility } from '@/lib/fast/types';
import type { CapitalPressureResult } from '@/lib/capitalPressure/types';
import type { QuickScorecard, QuickScoreMetric } from '@/lib/forensic/quickScorecard/types';
import type { ExtractedData } from '@/lib/shortCheckTypes';

export type DilutionPillTone = 'ok' | 'info' | 'warn' | 'risk' | 'muted';

export type DilutionStatusPill = {
  id: string;
  label: string;
  asOf?: string | null;
  tone: DilutionPillTone;
};

export type DilutionFactRow = {
  label: string;
  value: string;
  asOf?: string | null;
};

export type DilutionPillar = {
  id: 'need' | 'ability' | 'incentive';
  title: string;
  question: string;
  /** Existing 0–10 from Quick Scorecard — never recomputed here. */
  score: number | null;
  scoreLabel: string;
  confidence?: QuickScoreMetric['confidence'];
  rows: DilutionFactRow[];
  bottomLine: string;
};

export type DilutionWeapon = {
  name: string;
  badge: string;
  heroLabel: string;
  heroValue: string;
  heroAsOf?: string | null;
  whyItMatters: string;
  caveat?: string | null;
};

export type DilutionFinalCell = {
  id: string;
  label: string;
  value: string;
  detail?: string | null;
  tone: DilutionPillTone;
};

export type DilutionSource = {
  label: string;
  url: string;
  asOf?: string | null;
};

export type DilutionOverall = {
  letter: string;
  label: string;
  tone: DilutionPillTone;
  /** Clarifies this is financing support, not the Fast Verdict trade gate. */
  caption: string;
};

/** Existing Short Check composite — passed through, never recomputed here. */
export type DilutionShortRating = {
  rating: number;
  category:
    | 'High-Priority Short Candidate'
    | 'Moderate Short Candidate'
    | 'Speculative Short Candidate'
    | 'No-Trade';
  alerts: Array<{ label: string; color: 'red' | 'orange' | 'yellow' }>;
  dataCompleteness: number | null;
};

export type DilutionBrief = {
  ticker: string;
  session?: FastVerdict['session'] | null;
  tradeGate?: {
    verdict: FastVerdictKind;
    label: string;
    reason?: string | null;
  } | null;
  pills: DilutionStatusPill[];
  tenSecondRead: string;
  pillars: DilutionPillar[];
  weapon: DilutionWeapon;
  finalRead: DilutionFinalCell[];
  overall: DilutionOverall;
  shortRating?: DilutionShortRating | null;
  sources: DilutionSource[];
};

export type DilutionBriefInput = {
  ticker: string;
  fastVerdict?: FastVerdict | null;
  quickScorecard?: QuickScorecard | null;
  capitalPressure?: CapitalPressureResult | null;
  scanData?: {
    floatShares?: number | null;
    marketCap?: number | null;
    filings?: Array<{
      form?: string;
      filingDate?: string;
      date?: string;
      url?: string;
      documentUrl?: string;
      link?: string;
    }>;
  } | null;
  shortCheck?: {
    synopsis?: string | null;
    secFilingUrl?: string | null;
    extracted?: ExtractedData | null;
    rating?: number | null;
    category?: DilutionShortRating['category'] | null;
    alertLabels?: DilutionShortRating['alerts'] | null;
    dataCompleteness?: number | null;
  } | null;
  aiThesisLead?: string | null;
};

export type { OfferingAbility, NewsClass };
