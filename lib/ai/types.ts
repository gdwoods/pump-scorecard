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

export interface AiThesisResult {
  /** 2-3 sentence at-a-glance summary. */
  summary: string;
  /** Full synthesis paragraph(s) tying the scored factors into a coherent thesis. */
  thesis: string;
  catalysts: AiThesisCatalyst[];
  /** What would invalidate this thesis / what the model is least confident about. */
  keyRisks: string[];
  model: string;
  generatedAt: string;
}

export interface ThesisPromptInput {
  ticker: string;
  shortCheck?: {
    rating: number;
    category: string;
    walkAwayFlags: string[];
    alertLabels: Array<{ label: string; color: string }>;
    actualValues?: Record<string, string | undefined>;
  };
  extractedData?: {
    recentNews?: string;
    recentNewsDate?: string;
    newsStatus?: string;
    priceSpikePct?: number;
    currentPrice?: number;
    atmShelfStatus?: string;
  };
  scan?: {
    weightedRiskScore?: number;
    summaryVerdict?: string;
    droppinessVerdict?: string;
    capitalPressure?: {
      score: number;
      status: string;
      summary: string;
      reasons: Array<{ label: string; points: number }>;
    };
    news?: Array<{
      title?: string;
      headline?: string;
      date?: string;
      published?: string | number | null;
    }>;
    insiderTransactionsCount?: number;
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
  unavailable: string[];
}

/** What the client sends to /api/ai-thesis. All sections optional except ticker. */
