// scripts/verify-task-b.ts
import { classifyRunnerFromCloses } from '../lib/fast/runner';
import { classifyNewsHeadline } from '../lib/fast/newsClassifier';
import { computeBabyShelf } from '../lib/fast/babyShelf';
import { evaluateWalkAways } from '../lib/fast/walkAway';
import type { FastVerdict } from '../lib/fast/types';

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

// Runner fixtures from handoff (expected class from prior-day context into the spike)
// Values reconstructed from documented priorDay / 3d / CLEAN-vs-MIXED expectations.
const fixtures: Array<{
  name: string;
  c1: number;
  c2: number;
  c3: number;
  h20: number;
  expected: ReturnType<typeof classifyRunnerFromCloses>;
}> = [
  // 2026-03-02 MIXED — prior −10%, 3d −16%, not deep enough vs 20d high for CLEAN
  { name: '2026-03-02', c1: 90, c2: 100, c3: 107, h20: 120, expected: 'MIXED' },
  // 2026-05-27 MIXED
  { name: '2026-05-27', c1: 92, c2: 100, c3: 99, h20: 130, expected: 'MIXED' },
  // 2026-06-12 CLEAN — prior −7%, 3d −17%, well off 20d high
  { name: '2026-06-12', c1: 83, c2: 89, c3: 100, h20: 200, expected: 'CLEAN' },
  // 2026-07-17 CLEAN — prior −29%, 3d −59%
  { name: '2026-07-17', c1: 41, c2: 58, c3: 100, h20: 200, expected: 'CLEAN' },
  // 2026-07-21 CLEAN — prior −19%, 3d −53%
  { name: '2026-07-21', c1: 47, c2: 58, c3: 100, h20: 200, expected: 'CLEAN' },
];

for (const f of fixtures) {
  const got = classifyRunnerFromCloses({ c1: f.c1, c2: f.c2, c3: f.c3, h20: f.h20 });
  assert(got === f.expected, `runner ${f.name}: got ${got}, expected ${f.expected}`);
}

// Runner walk-aways fire alone
assert(
  classifyRunnerFromCloses({ c1: 140, c2: 100, c3: 120, h20: 200 }) === 'RUNNER_YESTERDAY',
  'runner yesterday'
);
assert(
  classifyRunnerFromCloses({ c1: 140, c2: 120, c3: 100, h20: 200 }) === 'RUNNER_MULTIDAY',
  'runner multiday'
);

// News classifier
assert(classifyNewsHeadline('Company receives FDA approval for drug').class === 'FATAL', 'fatal approval');
assert(
  classifyNewsHeadline('FDA acceptance of filing for review').class === 'NEUTRAL',
  'acceptance + approval-ish → weasel path'
);
assert(classifyNewsHeadline('Announces bitcoin treasury strategy').class === 'IDEAL', 'ideal');
assert(classifyNewsHeadline(null).class === 'NONE', 'none');

// Baby shelf DFNS-like
const dfns = computeBabyShelf({
  floatShares: 0.93e6,
  price: 6.49,
  quarterlyBurn: 4.93e6,
});
assert(dfns.publicFloatValue != null && Math.abs(dfns.publicFloatValue - 6.04e6) < 5e4, 'dfns float value');
assert(dfns.babyShelfCapacity != null && Math.abs(dfns.babyShelfCapacity - 2.01e6) < 5e4, 'dfns capacity');
assert(dfns.capacityQuarters != null && dfns.capacityQuarters < 0.5, 'dfns capacity quarters low');
assert(dfns.derivedOfferingAbility === 'LOW', 'dfns offering LOW: ' + dfns.derivedOfferingAbility);

const unverifiedDrop: FastVerdict['droppiness'] = {
  status: 'UNVERIFIED',
  score: null,
  spikeCount: null,
  computedAt: null,
  reason: 'not_cached',
};

function baseWalk(over: Partial<Parameters<typeof evaluateWalkAways>[0]> = {}) {
  return evaluateWalkAways({
    dataCompleteness: 1,
    todayMovePct: 0.5,
    newsClass: 'NEUTRAL',
    fatalWithWeasel: false,
    runnerClass: 'CLEAN',
    borrowAvailable: true,
    droppiness: { status: 'OK', score: 80, spikeCount: 5, computedAt: null },
    instOwn: 0.05,
    marketCap: 10e6,
    runwayMonths: 4,
    positiveFcf: false,
    floatShares: 10e6,
    derivedOfferingAbility: 'HIGH',
    ...over,
  });
}

assert(baseWalk().verdict === 'REVIEW', 'clean REVIEW');
assert(baseWalk({ dataCompleteness: 0.5 }).verdict === 'WATCH', 'W1');
assert(baseWalk({ dataCompleteness: 0.5 }).reason === 'W1:dataCompleteness', 'W1 reason');
assert(baseWalk({ todayMovePct: 0.1 }).reason === 'W2:todayMove', 'W2');
assert(baseWalk({ newsClass: 'FATAL' }).reason === 'W3:fatalNews', 'W3');
assert(baseWalk({ runnerClass: 'RUNNER_YESTERDAY' }).reason === 'W4:RUNNER_YESTERDAY', 'W4');
assert(baseWalk({ borrowAvailable: false }).reason === 'W5:borrowUnavailable', 'W5');
assert(
  baseWalk({
    droppiness: { status: 'OK', score: 0, spikeCount: 4, computedAt: null },
  }).reason === 'W6:droppiness',
  'W6'
);
assert(baseWalk({ instOwn: 0.5 }).reason === 'W7:instOwn', 'W7');
assert(baseWalk({ marketCap: 80e6 }).reason === 'W8:marketCap', 'W8');
assert(baseWalk({ runwayMonths: 24 }).reason === 'W9:runway', 'W9');
assert(
  baseWalk({ floatShares: 0.9e6, derivedOfferingAbility: 'LOW' }).reason === 'W10:squeezeGeometry',
  'W10'
);
assert(baseWalk({ droppiness: unverifiedDrop }).verdict === 'REVIEW', 'unverified drop still REVIEW if else clean');

// Verdict set closed
const verdicts = new Set(
  [
    baseWalk().verdict,
    baseWalk({ dataCompleteness: 0.4 }).verdict,
    baseWalk({ todayMovePct: 0 }).verdict,
  ]
);
for (const v of verdicts) {
  assert(v === 'NO_TRADE' || v === 'WATCH' || v === 'REVIEW', 'allowed verdict ' + v);
}

console.log(failed === 0 ? '\nALL TASK B ASSERTIONS PASSED' : `\n${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
