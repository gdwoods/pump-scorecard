// lib/ai/types.ts

export type CatalystSignificance = 'high' | 'moderate' | 'low' | 'stale';

export interface AiThesisCatalyst {
  description: string;
  /** ISO date if known, or a free-text recency phrase (e.g. "2026-08-18", "this week"). */
  date?: string;
  significance: CatalystSignificance;
  /** Why this catalyst was rated at that significance — not just what it is. */
  rationale: string;
}

export interface AiThesisForwardDate {
  date: string;
  event: string;
  significance: CatalystSignificance;
  /** Epistemic tag when date/event is inferred not filed. */
  tag?: 'verify' | 'conflict' | 'opinion';
}

export interface AiThesisResult {
  /** 2-3 sentence at-a-glance summary. */
  summary: string;
  /** Full synthesis paragraph(s) tying the scored factors into a coherent narrative. */
  thesis: string;
  catalysts: AiThesisCatalyst[];
  /** What would invalidate this thesis / what the model is least confident about. */
  keyRisks: string[];
  /** One-line regulatory / solvency alert when binding flags or high CP warrant it. */
  regulatoryAlert?: string;
  /** Ties DT rubric badges to SEC/scan evidence. */
  rubricNarrative?: string;
  /** Issuer financing / compliance constraints — not trade advice. Prefix uncertain lines with OPINION: or VERIFY:. */
  ceoLens?: string;
  /** Setup levels, supply zones, invalidation — not trade advice. Use OPINION: for judgments. */
  traderLens?: string;
  forwardDates?: AiThesisForwardDate[];
  /** Explicit VERIFY items the model could not ground. */
  dataGaps?: string[];
  model: string;
  generatedAt: string;
  reportVersion?: string;
}

export interface ThesisSecEvidence {
  form: string;
  filingDate: string;
  excerpt: string;
  accessionNumber?: string;
  documentUrl?: string;
}

export interface ThesisCapitalPressureReason {
  label: string;
  points: number;
  evidence?: ThesisSecEvidence;
}

export interface ThesisCapitalPressureEvent {
  eventDate: string;
  type: string;
  title: string;
  description?: string;
  evidence?: ThesisSecEvidence;
}

export interface ThesisDroppinessSpike {
  date: string;
  spikePct: number;
  retraced: boolean;
}

export interface ThesisPromptInput {
  ticker: string;
  shortCheck?: {
    rating: number;
    category: string;
    walkAwayFlags: string[];
    alertLabels: Array<{ label: string; color: string }>;
    actualValues?: Record<string, string | undefined>;
    /** Short Check cash-need component (0–25) for Quick Scorecard. */
    cashNeedPoints?: number;
    /** 0–1 populated-component fraction from Short Check scorer. */
    dataCompleteness?: number;
  };
  extractedData?: {
    recentNews?: string;
    recentNewsDate?: string;
    newsStatus?: string;
    priceSpikePct?: number;
    currentPrice?: number;
    atmShelfStatus?: string;
    float?: number;
  };
  scan?: {
    weightedRiskScore?: number;
    summaryVerdict?: string;
    droppinessVerdict?: string;
    droppinessScore?: number;
    droppinessDetail?: ThesisDroppinessSpike[];
    capitalPressure?: {
      available?: boolean;
      score: number;
      status: string;
      summary: string;
      dilutionLikelihood?: number;
      shortExecutionRisk?: number;
      recentIssuance?: {
        shares30d?: number;
        shares90d?: number;
        status?: string;
      };
      upcomingReverseSplit?: {
        effectiveDate?: string;
        ratio?: string;
        summary?: string;
      } | null;
      reasons?: ThesisCapitalPressureReason[];
      events?: Array<
        ThesisCapitalPressureEvent & {
          isRetrospective?: boolean;
        }
      >;
    };
    news?: Array<{
      title?: string;
      headline?: string;
      date?: string;
      published?: string | number | null;
    }>;
    insiderTransactionsCount?: number;
    fundamentals?: {
      price?: number;
      marketCap?: number;
      floatShares?: number;
      sharesOutstanding?: number;
      institutionalOwnership?: number;
      shortFloat?: number;
    };
  };
  /** ISO timestamp used as "now" for recency framing — inject a fixed value in tests. */
  now?: string;
  /** Fast Scan /api/fast verdict — second-highest precedence after vetoes. */
  fastVerdict?: FastVerdictPromptSlice;
}

/** Slim Fast Verdict fields sent to the AI thesis prompt. */
export interface FastVerdictPromptSlice {
  verdict: string;
  reason: string | null;
  flags: string[];
  runnerClass: string;
  priorDayPct: number | null;
  threeDayRunPct: number | null;
  droppinessStatus: string;
  droppinessScore: number | null;
  newsClass: string;
  newsHeadline: string | null;
  babyShelfCapacity: number | null;
  capacityQuarters: number | null;
  derivedOfferingAbility: string;
  atmDetected?: boolean | null;
  runwayMonths?: number | null;
  borrowAvailable: boolean | null;
  borrowFeePct: number | null;
  /** 0–1 source availability fraction from fast evaluator. */
  dataCompleteness: number;
  unavailable: string[];
}

/** What the client sends to /api/ai-thesis. All sections optional except ticker. */
