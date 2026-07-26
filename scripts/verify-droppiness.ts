// scripts/verify-droppiness.ts
import { toFastDroppiness, cacheFromCompute } from '../lib/droppiness/map';
import type { DroppinessComputeResult } from '../lib/droppiness/types';
import { evaluateWalkAways } from '../lib/fast/walkAway';

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

const empty = toFastDroppiness(null);
assert(empty.status === 'UNVERIFIED', 'miss → UNVERIFIED');
assert(empty.reason === 'not_cached', 'miss reason');

const lowSpikes = toFastDroppiness({
  score: 88,
  spikeCount: 2,
  nEff: 2,
  computedAt: '2026-07-26T00:00:00.000Z',
  method: 'bayesian_8h',
});
assert(lowSpikes.status === 'UNVERIFIED', 'few spikes → UNVERIFIED');
assert(lowSpikes.reason === 'insufficient_spikes', 'few spikes reason');
assert(lowSpikes.score === 88, 'score preserved when insufficient');

const ok = toFastDroppiness({
  score: 22,
  spikeCount: 5,
  nEff: 4.2,
  computedAt: '2026-07-26T00:00:00.000Z',
  method: 'bayesian_8h',
});
assert(ok.status === 'OK', 'enough spikes → OK');
assert(ok.score === 22, 'OK score');

const computeLike: DroppinessComputeResult = {
  score: 55,
  spikeCount: 4,
  nEff: 3.1,
  detail: [],
  intraday: [],
};
const cached = cacheFromCompute(computeLike);
assert(cached.method === 'bayesian_8h', 'method');
assert(cached.score === 55, 'cache score');
assert(typeof cached.computedAt === 'string', 'computedAt');

const walk = evaluateWalkAways({
  dataCompleteness: 1,
  todayMovePct: 0.5,
  newsClass: 'NEUTRAL',
  fatalWithWeasel: false,
  runnerClass: 'CLEAN',
  borrowAvailable: true,
  droppiness: ok,
  instOwn: 0.05,
  marketCap: 10e6,
  runwayMonths: 4,
  positiveFcf: false,
  floatShares: 10e6,
  derivedOfferingAbility: 'HIGH',
});
assert(walk.reason === 'W6:droppiness', 'W6 fires on OK low score');

console.log(failed === 0 ? '\nALL DROPPINESS ASSERTIONS PASSED' : `\n${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
