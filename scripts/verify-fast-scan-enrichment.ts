// scripts/verify-fast-scan-enrichment.ts
import { droppinessFromDailyBars } from '../lib/fast/droppinessDaily';
import { enrichFastVerdictFromScan } from '../lib/fast/enrichFromScan';
import type { FastVerdict } from '../lib/fast/types';
import { T } from '../lib/config/thresholds';

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

// QURE-like: spikes hold (low droppiness score)
const qureBars = [
  { date: '2026-01-01', o: 10, h: 10, l: 10, c: 10, v: 1e6 },
  { date: '2026-01-02', o: 10, h: 14, l: 13, c: 13.5, v: 2e6 },
  { date: '2026-01-03', o: 13, h: 18, l: 17, c: 17.5, v: 2e6 },
  { date: '2026-01-04', o: 17, h: 24, l: 22, c: 23, v: 3e6 },
  { date: '2026-01-05', o: 23, h: 32, l: 30, c: 31, v: 3e6 },
];
const qure = droppinessFromDailyBars(qureBars);
assert(qure.spikeCount >= 3, 'qure daily spikes');
assert(qure.score < T.droppiness.walkAway, 'qure low droppiness score');

const base: FastVerdict = {
  ticker: 'DFNS',
  verdict: 'REVIEW',
  reason: null,
  elapsedMs: 100,
  dataCompleteness: 0.8,
  session: 'open',
  price: { last: 12, todayMovePct: 0.4, volVs20d: 2, floatRotation: 0.5 },
  runner: {
    class: 'CLEAN',
    priorDayPct: 0.1,
    threeDayRunPct: 0.05,
    pctOff20dHigh: -0.2,
  },
  droppiness: {
    status: 'UNVERIFIED',
    score: null,
    spikeCount: null,
    computedAt: null,
    reason: 'not_cached',
  },
  filings: { today: [], daysSinceLast: 10 },
  fundamentals: {
    marketCap: 12e6,
    float: 1e6,
    instOwn: 0.05,
    shortInterest: 0.02,
    runwayMonths: null,
  },
  borrow: { available: true, feePct: 50 },
  news: {
    class: 'NEUTRAL',
    headline: null,
    ageMinutes: null,
    source: null,
    matchedTerms: { fatal: [], weasel: [], ideal: [] },
    tickerRecycleWarning: false,
  },
  dilution: {
    publicFloatValue: 12e6,
    babyShelfCapacity: 4e6,
    capacityQuarters: null,
    derivedOfferingAbility: 'LOW',
    atmDetected: null,
    equityLineCounterparty: null,
  },
  flags: ['droppiness UNVERIFIED'],
  unavailable: ['droppiness-kv'],
};

const enriched = enrichFastVerdictFromScan(base, {
  droppinessScore: 78,
  droppinessSpikeCount: 5,
  floatShares: 1_010_495,
  marketCap: 12_317_934,
  capitalPressure: {
    fundamentals: {
      cashUsd: 2_000_000,
      operatingCashFlowUsd: -4_930_000,
    },
  },
});

assert(enriched.droppiness.status === 'OK', 'scan droppiness OK');
assert(enriched.droppiness.score === 78, 'scan droppiness score');
assert(
  enriched.dilution.capacityQuarters != null && enriched.dilution.capacityQuarters < 1,
  'baby shelf capacity from scan burn'
);
assert(!enriched.flags.some((f) => /droppiness\s+UNVERIFIED/i.test(f)), 'UNVERIFIED flag cleared');

console.log(failed === 0 ? '\nALL FAST SCAN ENRICHMENT ASSERTIONS PASSED' : `\n${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
