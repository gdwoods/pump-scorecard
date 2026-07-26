// lib/fast/types.ts
export type FastVerdictKind = 'NO_TRADE' | 'WATCH' | 'REVIEW';

export type RunnerClass =
  | 'CLEAN'
  | 'MIXED'
  | 'RUNNER_YESTERDAY'
  | 'RUNNER_MULTIDAY';

export type NewsClass = 'FATAL' | 'IDEAL' | 'NEUTRAL' | 'NONE';

export type OfferingAbility = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type FilingSignal = 'CONFIRM' | 'CAUTION' | 'REVIEW';

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
  };
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
