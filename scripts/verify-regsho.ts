import {
  appendRegShoFlag,
  listingFromRegShoIndex,
  parseRegShoFile,
} from '../lib/fast/fetchRegSho';
import { formatFastVerdictText } from '../lib/fast/formatText';
import { enrichFastVerdictFromScan } from '../lib/fast/enrichFromScan';
import { buildFastVerdict } from '../lib/fast/evaluate';
import type { FastVerdict } from '../lib/fast/types';
import type { Tier2Bundle } from '../lib/fast/fetchTier2';

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

const fixture = `Symbol|Security Name|Market Category|Reg SHO Threshold Flag|Rule 3210|Filler 
ONDS|ONDAS INC COM NEW|S|Y|N| 
AAPD|DIREXION SHS ETF TR DAILY AAPL|G|Y|N| 
20260925230022
`;

const index = parseRegShoFile(fixture, '2026-09-25');
const onds = listingFromRegShoIndex(index, 'onds');
assert(onds.status === 'threshold', 'ONDS is on threshold list');
assert(onds.securityName === 'ONDAS INC COM NEW', 'ONDS security name');
assert(onds.marketCategory === 'S', 'ONDS market S');
assert(onds.tradeDate === '2026-09-25', 'trade date from file');

const flag = appendRegShoFlag([], onds)[0] ?? '';
assert(flag.includes('Reg SHO threshold'), 'flag prefix');
assert(flag.includes('ONDAS INC COM NEW'), 'flag includes name');
assert(flag.includes('NCM'), 'flag maps S to NCM');
assert(flag.includes('as of 2026-09-25'), 'flag includes as-of date');

assert(listingFromRegShoIndex(index, 'AAPD').status === 'threshold', 'AAPD indexed');
assert(listingFromRegShoIndex(index, 'AAPL').status === 'not_listed', 'AAPL not on list');
assert(appendRegShoFlag(['x'], listingFromRegShoIndex(index, 'AAPL')).join() === 'x', 'no flag when not listed');

let threw = false;
try {
  parseRegShoFile('Symbol|Security Name|Market Category|Reg SHO Threshold Flag|Rule 3210|Filler \n20260925230022\n', '2026-09-25');
} catch {
  threw = true;
}
assert(threw, 'header-only file throws');
threw = false;
try {
  parseRegShoFile('<html><body>else else File Not Found</body></html>', '2026-09-26');
} catch {
  threw = true;
}
assert(threw, 'html 404 body throws');

const base: FastVerdict = {
  ticker: 'ONDS',
  verdict: 'REVIEW',
  reason: null,
  elapsedMs: 10,
  dataCompleteness: 1,
  session: 'open',
  price: { last: 1, todayMovePct: 0.4, volVs20d: 2, floatRotation: 0.1 },
  runner: { class: 'CLEAN', priorDayPct: 0.01, threeDayRunPct: 0.02, pctOff20dHigh: -0.1 },
  droppiness: { status: 'OK', score: 70, spikeCount: 4, computedAt: null },
  filings: { today: [], daysSinceLast: null },
  fundamentals: {
    marketCap: 10e6,
    float: 5e6,
    instOwn: 0.1,
    shortInterest: 0.02,
    runwayMonths: 3,
  },
  borrow: { available: true, feePct: 20 },
  news: {
    class: 'NONE',
    headline: null,
    ageMinutes: null,
    source: null,
    matchedTerms: { fatal: [], weasel: [], ideal: [] },
    tickerRecycleWarning: false,
  },
  dilution: {
    publicFloatValue: 10e6,
    babyShelfCapacity: 3e6,
    capacityQuarters: 1,
    derivedOfferingAbility: 'HIGH',
    atmDetected: false,
    equityLineCounterparty: null,
  },
  nasdaqListing: { status: 'not_listed', deficiencies: [], sourceUrl: 'https://example.com' },
  regSho: onds,
  flags: appendRegShoFlag([], onds),
  unavailable: [],
};

const text = formatFastVerdictText(base);
assert(text.includes('ONDS  REVIEW'), 'text verdict unchanged');
assert(text.includes('Reg SHO  THRESHOLD'), 'text has Reg SHO line');
assert(text.indexOf('Nasdaq') < text.indexOf('Reg SHO'), 'Reg SHO line follows Nasdaq');

const enriched = enrichFastVerdictFromScan(base, {
  floatShares: 5e6,
  marketCap: 10e6,
});
assert(
  enriched.flags.some((f) => f.startsWith('Reg SHO threshold')),
  'enrichFromScan keeps Reg SHO flag'
);
assert(enriched.verdict === 'REVIEW', 'Reg SHO flag does not change verdict');

const skip = { ok: false as const, error: 'skip' };
const mockTier = {
  snapshot: skip,
  bars: skip,
  fundamentals: skip,
  filings: skip,
  borrow: skip,
  news: skip,
  droppiness: skip,
  burn: skip,
  nasdaq: skip,
  regSho: { ok: true as const, value: onds },
} as Tier2Bundle;
const built = buildFastVerdict('ONDS', mockTier, Date.now());
assert(built.regSho?.status === 'threshold', 'evaluate attaches regsho listing');
assert(built.flags.some((f) => f.startsWith('Reg SHO threshold')), 'evaluate adds soft flag');
assert(built.reason === 'W1:dataCompleteness', 'missing core sources still drive W1, not Reg SHO');

console.log(failed === 0 ? '\nALL REGSHO ASSERTIONS PASSED' : `\n${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
