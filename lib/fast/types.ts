// lib/fast/types.ts
import type { RegShoShortVolumeReport } from './regShoShortVolume';

export type FastVerdictKind = 'NO_TRADE' | 'WATCH' | 'REVIEW';

export type RunnerClass =
  | 'CLEAN'
  | 'MIXED'
  | 'RUNNER_YESTERDAY'
  | 'RUNNER_MULTIDAY';

export type NewsClass = 'FATAL' | 'IDEAL' | 'NEUTRAL' | 'NONE';

export type OfferingAbility = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type FilingSignal = 'CONFIRM' | 'CAUTION' | 'REVIEW';

export type NasdaqListingStatus = 'noncompliant' | 'not_listed' | 'unavailable';

export type NasdaqListing = {
  status: NasdaqListingStatus;
  issuerName?: string | null;
  market?: string | null;
  deficiencies: Array<{ type: string; notificationDate: string }>;
  sourceUrl: string;
};

export type RegShoStatus = 'threshold' | 'not_listed' | 'unavailable';

export type RegShoListing = {
  status: RegShoStatus;
  securityName?: string | null;
  marketCategory?: string | null;
  tradeDate?: string | null;
  rule3210?: string | null;
  sourceUrl: string;
};

/** AskEdgar symbol-change history. Overlay only — not a walk-away. */
export type TickerChangeEvent = {
  oldTicker: string;
  newTicker: string;
  effectiveDate: string;
};

export type TickerChangesStatus = 'changed' | 'none' | 'ambiguous' | 'unavailable';

export type TickerChanges = {
  status: TickerChangesStatus;
  queryTicker: string;
  /** Latest symbol in the recorded history. Null when there is no change, or the chain ends on two symbols the same day. */
  currentTicker: string | null;
  history: TickerChangeEvent[];
  warnings: string[];
  /** Symbols named when the chain is too long to trust (HTTP 409). */
  involvedTickers?: string[];
  reason?: string;
};

export type FastVerdict = {
  ticker: string;
  verdict: FastVerdictKind;
  reason: string | null;
  elapsedMs: number;
  dataCompleteness: number;
  session: 'open' | 'closed';

  price: {
    last: number | null;
    todayMovePct: number | null;
    volVs20d: number | null;
    floatRotation: number | null;
  };
  runner: {
    class: RunnerClass;
    priorDayPct: number | null;
    threeDayRunPct: number | null;
    pctOff20dHigh: number | null;
  };
  droppiness: {
    status: 'OK' | 'UNVERIFIED';
    score: number | null;
    spikeCount: number | null;
    computedAt: string | null;
    reason?: string;
  };
  filings: {
    today: Array<{ form: string; filedAt: string; signal: FilingSignal }>;
    daysSinceLast: number | null;
  };
  fundamentals: {
    marketCap: number | null;
    float: number | null;
    instOwn: number | null;
    shortInterest: number | null;
    runwayMonths: number | null;
  };
  borrow: { available: boolean | null; feePct: number | null };
  news: {
    class: NewsClass;
    headline: string | null;
    ageMinutes: number | null;
    source: string | null;
    matchedTerms: { fatal: string[]; weasel: string[]; ideal: string[] };
    tickerRecycleWarning: boolean;
  };
  dilution: {
    publicFloatValue: number | null;
    babyShelfCapacity: number | null;
    capacityQuarters: number | null;
    derivedOfferingAbility: OfferingAbility;
    atmDetected: boolean | null;
    equityLineCounterparty: string | null;
    hasEffectiveShelf?: boolean | null;
  };
  /** Official Nasdaq noncompliant (deficient) list — overlay, not a walk-away. */
  nasdaqListing?: NasdaqListing;
  /** Nasdaq Trader Regulation SHO threshold list — overlay, not a walk-away. */
  regSho?: RegShoListing;
  /** FINRA TRF daily short-sale volume — overlay, not a score input or walk-away. */
  shortVolume?: RegShoShortVolumeReport;
  /** AskEdgar symbol-change history — overlay, not a walk-away. */
  tickerChanges?: TickerChanges;
  flags: string[];
  unavailable: string[];
};

export type DailyBar = {
  date: string; // YYYY-MM-DD
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};
