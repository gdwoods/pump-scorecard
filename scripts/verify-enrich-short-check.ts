// scripts/verify-enrich-short-check.ts
import {
  enrichFastVerdictFromShortCheck,
  offeringAbilityFromExtracted,
} from '../lib/fast/enrichFromShortCheck';
import type { FastVerdict } from '../lib/fast/types';
import type { ExtractedData } from '../lib/shortCheckTypes';

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

const base: FastVerdict = {
  ticker: 'DFNS',
  verdict: 'WATCH',
  reason: 'W1:dataCompleteness',
  elapsedMs: 100,
  dataCompleteness: 0.5,
  session: 'closed',
  price: { last: 4.3, todayMovePct: 0, volVs20d: 1, floatRotation: null },
  runner: { class: 'CLEAN', priorDayPct: -0.1, threeDayRunPct: -0.2, pctOff20dHigh: -0.5 },
  droppiness: {
    status: 'UNVERIFIED',
    score: null,
    spikeCount: null,
    computedAt: null,
    reason: 'not_cached',
  },
  filings: { today: [], daysSinceLast: null },
  fundamentals: {
    marketCap: null,
    float: null,
    instOwn: null,
    shortInterest: null,
    runwayMonths: null,
  },
  borrow: { available: true, feePct: 4 },
  news: {
    class: 'NONE',
    headline: null,
    ageMinutes: null,
    source: null,
    matchedTerms: { fatal: [], weasel: [], ideal: [] },
    tickerRecycleWarning: false,
  },
  dilution: {
    publicFloatValue: null,
    babyShelfCapacity: null,
    capacityQuarters: null,
    derivedOfferingAbility: 'UNKNOWN',
    atmDetected: null,
    equityLineCounterparty: null,
  },
  flags: ['droppiness UNVERIFIED'],
  unavailable: ['fundamentals'],
};

assert(offeringAbilityFromExtracted({ atmShelfStatus: 'DT:Green', confidence: 1 }) === 'LOW', 'DT:Green → LOW');
assert(offeringAbilityFromExtracted({ atmShelfStatus: 'DT:High', confidence: 1 }) === 'HIGH', 'DT:High → HIGH');
assert(offeringAbilityFromExtracted({ atmShelfStatus: 'DT:Medium', confidence: 1 }) === 'MEDIUM', 'DT:Medium → MEDIUM');

const extracted: ExtractedData = {
  atmShelfStatus: 'DT:Green',
  float: 930_000,
  currentPrice: 4.35,
  marketCap: 20e6,
  confidence: 0.9,
};

const enriched = enrichFastVerdictFromShortCheck(base, {
  scanDroppiness: { score: 81, detail: [{}, {}, {}, {}] },
  extracted,
});

assert(enriched.droppiness.status === 'OK', 'drop status OK');
assert(enriched.droppiness.score === 81, 'drop score 81');
assert(enriched.dilution.derivedOfferingAbility === 'LOW', 'dilute from DT');
assert(!enriched.flags.some((f) => /UNVERIFIED/i.test(f)), 'UNVERIFIED flag cleared');
assert(enriched.fundamentals.float === 930_000, 'float from DT');

console.log(failed === 0 ? '\nALL ENRICH ASSERTIONS PASSED' : `\n${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
