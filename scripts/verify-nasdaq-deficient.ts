import {
  appendNasdaqListingFlag,
  listingFromIndex,
  parseNasdaqDeficientPayload,
} from '../lib/fast/fetchNasdaqDeficient';
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

const fixture = {
  data: {
    noncomplaintCompanyList: {
      rows: [
        {
          IssuerName: '20/20 Biolabs, Inc.',
          companies: [
            {
              Deficiency: 'Bid Price',
              Market: 'NCM',
              NotificationDate: '7/17/2026',
              AffectedIssues: ['AIDX'],
            },
          ],
        },
        {
          IssuerName: 'Adagio Medical Holdings, Inc',
          companies: [
            {
              Deficiency: 'Bid Price',
              Market: 'NCM',
              NotificationDate: '6/12/2026',
              AffectedIssues: ['ADGM'],
            },
            {
              Deficiency: 'Equity',
              Market: 'NCM',
              NotificationDate: '8/13/2026',
              AffectedIssues: ['ADGM'],
            },
          ],
        },
        {
          IssuerName: 'A SPAC III Acquisition Corp.',
          companies: [
            {
              Deficiency: 'Equity',
              Market: 'NCM',
              NotificationDate: '5/20/2026',
              AffectedIssues: ['ASPCU', 'ASPC', 'ASPCR'],
            },
          ],
        },
      ],
    },
  },
};

const index = parseNasdaqDeficientPayload(fixture);
const aidx = listingFromIndex(index, 'aidx');
assert(aidx.status === 'noncompliant', 'AIDX is noncompliant');
assert(aidx.deficiencies[0]?.type === 'Bid Price', 'AIDX Bid Price deficiency');

const adgm = listingFromIndex(index, 'ADGM');
assert(adgm.deficiencies.length === 2, 'ADGM has two deficiencies');
const flag = appendNasdaqListingFlag([], adgm)[0] ?? '';
assert(flag.includes('Bid Price (6/12/2026)'), 'flag includes bid-price date');
assert(flag.includes('Equity (8/13/2026)'), 'flag includes equity date');

assert(listingFromIndex(index, 'ASPCU').status === 'noncompliant', 'ASPCU indexed');
assert(listingFromIndex(index, 'AAPL').status === 'not_listed', 'AAPL not on list');
assert(appendNasdaqListingFlag(['x'], listingFromIndex(index, 'AAPL')).join() === 'x', 'no flag when not listed');

let threw = false;
try {
  parseNasdaqDeficientPayload({ data: {} });
} catch {
  threw = true;
}
assert(threw, 'malformed payload throws');

const base: FastVerdict = {
  ticker: 'ADGM',
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
  nasdaqListing: adgm,
  flags: appendNasdaqListingFlag([], adgm),
  unavailable: [],
};

const text = formatFastVerdictText(base);
assert(text.includes('ADGM  REVIEW'), 'text verdict unchanged');
assert(text.includes('Nasdaq  NONCOMPLIANT'), 'text has Nasdaq line');

const enriched = enrichFastVerdictFromScan(base, {
  floatShares: 5e6,
  marketCap: 10e6,
});
assert(
  enriched.flags.some((f) => f.startsWith('Nasdaq noncompliant')),
  'enrichFromScan keeps Nasdaq flag'
);
assert(enriched.verdict === 'REVIEW', 'Nasdaq flag does not change verdict');

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
  nasdaq: { ok: true as const, value: adgm },
} as Tier2Bundle;
const built = buildFastVerdict('ADGM', mockTier, Date.now());
assert(built.nasdaqListing?.status === 'noncompliant', 'evaluate attaches nasdaq listing');
assert(built.flags.some((f) => f.startsWith('Nasdaq noncompliant')), 'evaluate adds soft flag');
assert(built.reason === 'W1:dataCompleteness', 'missing core sources still drive W1, not Nasdaq');

console.log(failed === 0 ? '\nALL NASDAQ DEFICIENT ASSERTIONS PASSED' : `\n${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
