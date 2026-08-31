// scripts/verify-quick-scorecard.ts
//
// Verifies Quick Scorecard scoring without network calls.

import { buildQuickScorecard } from '../lib/forensic/quickScorecard/buildQuickScorecard';
import { QUICK_SCORE_METRIC_TOOLTIPS } from '../lib/forensic/quickScorecard/metricTooltips';
import type { QuickScorecardInput } from '../lib/forensic/quickScorecard/types';

let failures = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

const now = '2026-08-30T12:00:00.000Z';

const shelfOnly: QuickScorecardInput = {
  ticker: 'ORDY',
  now,
  capitalPressure: {
    available: true,
    score: 10,
    status: 'watch',
    dilutionLikelihood: 1,
    recentIssuance: { status: 'unknown' },
    events: [{ type: 'shelf_registration', eventDate: '2026-06-01' }],
  },
  fastVerdict: {
    derivedOfferingAbility: 'LOW',
    capacityQuarters: 8,
  },
};

const offeringTrap: QuickScorecardInput = {
  ticker: 'TRAP',
  now,
  capitalPressure: {
    available: true,
    score: 82,
    status: 'high',
    dilutionLikelihood: 8,
    recentIssuance: { shares30d: 1_500_000, status: 'reported' },
    reasons: [{ label: 'Active ATM/ELOC draw in last 30 days', points: 22 }],
    events: [{ type: 'atm_program', eventDate: '2026-08-10' }],
  },
  shortCheck: { cashNeedPoints: 25 },
  fastVerdict: {
    derivedOfferingAbility: 'HIGH',
    atmDetected: true,
    capacityQuarters: 0.4,
  },
};

const delistingSurvival: QuickScorecardInput = {
  ticker: 'DLST',
  now,
  capitalPressure: {
    available: true,
    score: 45,
    status: 'elevated',
    dilutionLikelihood: 5,
    events: [
      { type: 'nasdaq_deficiency', eventDate: '2026-07-01' },
      { type: 'reverse_split', eventDate: '2026-05-15', isRetrospective: false },
    ],
  },
  shortCheck: { cashNeedPoints: 18 },
};

const unavailableCp: QuickScorecardInput = {
  ticker: 'NOCP',
  now,
  capitalPressure: {
    available: false,
    score: 0,
    status: 'low',
  },
  fastVerdict: {
    derivedOfferingAbility: 'HIGH',
  },
};

const intersection: QuickScorecardInput = {
  ticker: 'MAXX',
  now,
  capitalPressure: {
    available: true,
    score: 90,
    status: 'high',
    dilutionLikelihood: 9,
    shortExecutionRisk: 4,
  },
  shortCheck: { cashNeedPoints: 25 },
  fastVerdict: {
    derivedOfferingAbility: 'HIGH',
    runnerClass: 'RUNNER_YESTERDAY',
    borrowAvailable: false,
  },
  fundamentals: { float: 1_500_000 },
};

function main() {
  const shelf = buildQuickScorecard(shelfOnly);
  assert(shelf.offering.value === 1, 'shelf-only offering stays low');
  assert(!shelf.offeringTrap, 'shelf-only does not trigger offering trap');
  assert((shelf.combined.value ?? 0) <= 3, 'shelf-only combined stays modest');

  const trap = buildQuickScorecard(offeringTrap);
  assert(trap.offeringTrap, 'high offering + cash need + draw triggers offering trap');
  assert((trap.offering.value ?? 0) >= 8, 'offering trap case keeps high offering score');
  assert((trap.cashNeed.value ?? 0) >= 7, 'offering trap case keeps high cash need');

  const delist = buildQuickScorecard(delistingSurvival);
  assert((delist.delisting.value ?? 0) >= 7, 'Nasdaq deficiency elevates delisting score');
  assert((delist.survivalPump.value ?? 0) >= 4, 'deficiency + cash need raises survival-pump');

  const noCp = buildQuickScorecard(unavailableCp);
  assert(noCp.offering.value == null, 'unavailable CP leaves offering unknown');
  assert(noCp.offering.confidence === 'unknown', 'unavailable CP marks offering confidence unknown');
  assert((noCp.combined.value ?? 99) <= 5, 'unavailable CP does not produce fake high combined score');

  const max = buildQuickScorecard(intersection);
  const subScores = [
    max.offering.value,
    max.delisting.value,
    max.survivalPump.value,
    max.squeeze.value,
  ].filter((value): value is number => value != null);
  const simpleAverage =
    subScores.reduce((sum, value) => sum + value, 0) / Math.max(subScores.length, 1);
  assert(
    (max.combined.value ?? 0) >= Math.max(...subScores),
    'combined is at least the max sub-score'
  );
  assert(
    (max.combined.value ?? 0) > simpleAverage,
    'combined uses intersection weighting, not a simple average'
  );
  assert((max.combined.value ?? 0) >= 9, 'high offering + cash need intersection reaches score 9+');

  const keys = ['combined', 'offering', 'cashNeed', 'delisting', 'survivalPump', 'squeeze'] as const;
  for (const key of keys) {
    assert(
      QUICK_SCORE_METRIC_TOOLTIPS[key].length > 20,
      `tooltip defined for ${key}`
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nALL QUICK SCORECARD ASSERTIONS PASSED');
}

main();
