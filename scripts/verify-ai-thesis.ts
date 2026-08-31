// scripts/verify-ai-thesis.ts
//
// Verifies the AI thesis feature's prompt-building, parsing, rate limiting,
// and Groq-call plumbing without a live GROQ_API_KEY or network access.

import { buildThesisMessages } from '../lib/ai/buildThesisPrompt';
import { fastVerdictToPromptSlice } from '../lib/ai/fastVerdictPrompt';
import { callGroq, type GroqFetcher } from '../lib/ai/groqClient';
import { callOpenRouter } from '../lib/ai/openRouterClient';
import {
  checkGroqDailyBudget,
  formatGroqBudgetError,
  getGroqDailyBudgetLimit,
  recordGroqApiCall,
} from '../lib/ai/groqBudget';
import { parseThesisContent } from '../lib/ai/parseThesisContent';
import { checkAiThesisRateLimit, isAiThesisRateLimitWhitelisted } from '../lib/ai/rateLimit';
import { thesisCacheKey, thesisTickerCacheKey } from '../lib/ai/thesisCache';
import type { FastVerdict } from '../lib/fast/types';
import type { ThesisPromptInput } from '../lib/ai/types';

let failures = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

const mockFastVerdict: FastVerdict = {
  ticker: 'DFNS',
  verdict: 'NO_TRADE',
  reason: 'Baby shelf critical',
  elapsedMs: 100,
  dataCompleteness: 0.9,
  session: 'closed',
  price: { last: 3.2, todayMovePct: 5, volVs20d: 1.2, floatRotation: 0.1 },
  runner: { class: 'CLEAN', priorDayPct: 5, threeDayRunPct: 12, pctOff20dHigh: 20 },
  droppiness: { status: 'OK', score: 72, spikeCount: 4, computedAt: '2026-08-29T00:00:00Z' },
  filings: { today: [], daysSinceLast: 10 },
  fundamentals: {
    marketCap: 20e6,
    float: 2e6,
    instOwn: 5,
    shortInterest: 1,
    runwayMonths: 4,
  },
  borrow: { available: true, feePct: 2 },
  news: { class: 'NEUTRAL', headline: 'Announces reverse split', ageMinutes: 60, source: 'wire', matchedTerms: { fatal: [], weasel: [], ideal: [] }, tickerRecycleWarning: false },
  dilution: {
    publicFloatValue: 2e6,
    babyShelfCapacity: 21.31e6,
    capacityQuarters: 0.3,
    derivedOfferingAbility: 'HIGH',
    atmDetected: true,
    equityLineCounterparty: null,
  },
  flags: ['Baby Shelf Critical (I.B.6): ~39 days of burn'],
  unavailable: [],
};

const fullInput: ThesisPromptInput = {
  ticker: 'DFNS',
  now: '2026-08-29T00:00:00Z',
  fastVerdict: fastVerdictToPromptSlice(mockFastVerdict),
  shortCheck: {
    rating: 0,
    category: 'No-Trade',
    walkAwayFlags: ['Baby Shelf Critical (I.B.6): $21.31M annual shelf capacity ~ 39 days of burn'],
    alertLabels: [{ label: 'BABY_SHELF_CRITICAL', color: 'red' }],
    actualValues: { cashNeed: '$50.0M burn', offeringAbility: '$21.31M annual shelf capacity ~ 39 days of burn' },
    dataCompleteness: 0.42,
  },
  extractedData: {
    recentNews: 'Announces reverse split',
    recentNewsDate: '2026-08-15',
    newsStatus: 'found',
    currentPrice: 319.7,
    atmShelfStatus: 'DT:Red',
  },
  scan: {
    weightedRiskScore: 40,
    summaryVerdict: 'Moderate risk',
    droppinessVerdict: 'Spikes usually fade quickly',
    droppinessScore: 72,
    droppinessDetail: [
      { date: '2026-06-12', spikePct: 40.2, retraced: true },
      { date: '2026-05-03', spikePct: 28.5, retraced: false },
    ],
    capitalPressure: {
      score: 77,
      status: 'high',
      summary: 'High capital pressure',
      reasons: [
        {
          label: 'Active ATM/ELOC with confirmed draw',
          points: 22,
          evidence: {
            form: '10-Q',
            filingDate: '2026-08-01',
            excerpt:
              'During the quarter the Company issued 1,250,000 shares under the ELOC for aggregate proceeds of $3.1 million.',
            accessionNumber: '0001234567-26-000123',
          },
        },
      ],
    },
    news: [{ title: 'Announces reverse split', date: '2026-08-15' }],
    insiderTransactionsCount: 3,
  },
};

const messages = buildThesisMessages(fullInput);
assert(messages.length === 2, 'buildThesisMessages returns [system, user]');
assert(messages[0].role === 'system', 'first message is system role');
assert(messages[0].content.includes('LOWEST-precedence'), 'system prompt encodes Framework 3.0 precedence order');
assert(messages[0].content.includes('Respond with ONLY a single JSON object'), 'system prompt demands strict JSON');

assert(messages[0].content.includes('VERIFY:'), 'system prompt documents VERIFY tagging');
assert(messages[0].content.includes('Forensic Fact Pack'), 'system prompt references fact pack');

const userContent = messages[1].content;
assert(userContent.includes('Forensic Fact Pack'), 'user message includes forensic fact pack');
assert(userContent.includes('forensic-fact-pack-v1'), 'user message includes fact pack version');
assert(userContent.includes('DFNS'), 'user message includes ticker');
assert(userContent.includes('Fast Verdict'), 'user message includes Fast Verdict section');
assert(userContent.includes('NO_TRADE'), 'user message includes fast verdict kind');
assert(userContent.includes('Baby Shelf Critical'), 'user message surfaces walk-away flags');
assert(userContent.includes('BINDING'), 'user message marks walk-away flags as binding');
assert(userContent.includes('2026-08-15'), 'user message includes catalyst date');
assert(userContent.includes('Deprecated legacy scan score'), 'user message marks legacy pump score deprecated');
assert(userContent.includes('77/100'), 'user message includes Capital Pressure score');
assert(userContent.includes('Quick Scorecard'), 'user message includes quick scorecard');
assert(userContent.includes('Excerpt:'), 'user message includes SEC filing excerpt via fact pack');
assert(userContent.includes('ELOC'), 'user message includes filing excerpt text');
assert(userContent.includes('2026-06-12'), 'user message includes droppiness spike date');
assert(userContent.includes('retraced'), 'user message includes droppiness spike outcome');
assert(userContent.includes('Borrow: available'), 'user message includes borrow availability');
assert(userContent.includes('Short Check data completeness: 42%'), 'user message includes short check completeness');
assert(userContent.includes('Fast Verdict data completeness: 90%'), 'user message includes fast verdict completeness');
assert(userContent.includes('filing count only'), 'user message clarifies insider count limitation');

const minimalMessages = buildThesisMessages({
  ticker: 'ABCD',
  fastVerdict: fastVerdictToPromptSlice(mockFastVerdict),
});
assert(minimalMessages.length === 2, 'buildThesisMessages handles fast-verdict-only input');
assert(minimalMessages[1].content.includes('NO_TRADE'), 'fast-verdict-only prompt still includes verdict');

const validJson = JSON.stringify({
  summary: 'Short setup looks weak.',
  thesis: 'OPINION: Multiple binding flags align.',
  regulatoryAlert: 'Baby shelf critical — binding walk-away.',
  rubricNarrative: 'DT offering badge matches CP ATM evidence.',
  ceoLens: 'OPINION: Issuer likely needs another shelf refresh.',
  traderLens: 'VERIFY: Borrow not confirmed in fact pack.',
  catalysts: [
    {
      description: 'Reverse split announced',
      date: '2026-08-15',
      significance: 'high',
      rationale: 'Dated, material corporate action.',
    },
  ],
  forwardDates: [
    { date: '2026-09-15', event: 'Compliance deadline', significance: 'high', tag: 'verify' },
  ],
  dataGaps: ['VERIFY: Warrant overhang table not in fact pack'],
  keyRisks: ['Borrow unavailable'],
});
const parsed = parseThesisContent(validJson, 'test-model');
assert(parsed !== null, 'parseThesisContent accepts valid JSON');
assert(parsed?.catalysts.length === 1, 'parseThesisContent keeps valid catalysts');
assert(parsed?.keyRisks.length === 1, 'parseThesisContent keeps key risks');
assert(parsed?.regulatoryAlert?.includes('Baby shelf'), 'parseThesisContent keeps regulatoryAlert');
assert(parsed?.rubricNarrative?.includes('DT offering'), 'parseThesisContent keeps rubricNarrative');
assert(parsed?.ceoLens?.includes('OPINION:'), 'parseThesisContent keeps ceoLens');
assert(parsed?.traderLens?.includes('VERIFY:'), 'parseThesisContent keeps traderLens');
assert(parsed?.forwardDates?.length === 1, 'parseThesisContent keeps forwardDates');
assert(parsed?.dataGaps?.length === 1, 'parseThesisContent keeps dataGaps');
assert(parsed?.reportVersion === 'forensic-brief-v1', 'parseThesisContent sets reportVersion');

const invalidCatalyst = parseThesisContent(
  JSON.stringify({
    summary: 'ok',
    thesis: 'ok',
    catalysts: [{ description: 'x', significance: 'bogus', rationale: '' }],
    keyRisks: [],
  }),
  'test-model'
);
assert(invalidCatalyst?.catalysts.length === 0, 'parseThesisContent drops invalid catalysts');

async function testCallGroqSuccess() {
  const mockFetcher: GroqFetcher = async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: '{"summary":"ok","thesis":"ok"}' } }] }),
      { status: 200 }
    );
  const originalKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-key';
  const result = await callGroq([{ role: 'user', content: 'hi' }], { fetcher: mockFetcher });
  process.env.GROQ_API_KEY = originalKey;
  assert(result.success === true, 'callGroq returns success on 200 with valid content');
}

async function testCallGroqRateLimit() {
  const mockFetcher: GroqFetcher = async () =>
    new Response('rate limited', { status: 429, headers: { 'retry-after': '120' } });
  const originalKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-key';
  const result = await callGroq([{ role: 'user', content: 'hi' }], { fetcher: mockFetcher });
  process.env.GROQ_API_KEY = originalKey;
  assert(result.success === false, 'callGroq returns failure on 429');
  assert(result.errorCode === 'rate_limit', 'callGroq tags rate_limit error code');
  assert(result.retryAfterSec === 120, 'callGroq parses retry-after header');
  assert(!!result.error?.includes('minute'), 'callGroq surfaces retry timing in message');
}

async function testCallOpenRouterSuccess() {
  const mockFetcher: GroqFetcher = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"summary":"ok","thesis":"ok"}' } }],
      }),
      { status: 200 }
    );
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-or-key';
  const result = await callOpenRouter([{ role: 'user', content: 'hi' }], { fetcher: mockFetcher });
  process.env.OPENROUTER_API_KEY = originalKey;
  assert(result.success === true, 'callOpenRouter returns success on 200');
}

async function testCallGroqNoKey() {
  const originalKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  const result = await callGroq([{ role: 'user', content: 'hi' }]);
  process.env.GROQ_API_KEY = originalKey;
  assert(result.success === false, 'callGroq fails cleanly with no API key configured');
  assert(!!result.error?.includes('GROQ_API_KEY'), 'callGroq error names the missing env var');
}

async function testCallGroqNetworkError() {
  const mockFetcher: GroqFetcher = async () => {
    throw new Error('ECONNRESET');
  };
  const originalKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-key';
  const result = await callGroq([{ role: 'user', content: 'hi' }], { fetcher: mockFetcher });
  process.env.GROQ_API_KEY = originalKey;
  assert(result.success === false, 'callGroq never throws on network failure');
}

async function testLocalRateLimit() {
  const ip = `test-ip-${Date.now()}`;
  for (let i = 0; i < 10; i++) {
    const result = await checkAiThesisRateLimit(ip);
    assert(result.allowed === true, `local rate limit allows request ${i + 1}`);
  }
  const blocked = await checkAiThesisRateLimit(ip);
  assert(blocked.allowed === false, 'local rate limit blocks after 10 requests');
}

function testWhitelist() {
  const original = process.env.AI_THESIS_RATE_LIMIT_WHITELIST;
  process.env.AI_THESIS_RATE_LIMIT_WHITELIST = '203.0.113.10, 198.51.100.2';
  assert(isAiThesisRateLimitWhitelisted('203.0.113.10'), 'whitelist matches listed IP');
  assert(!isAiThesisRateLimitWhitelisted('203.0.113.11'), 'whitelist does not match other IPs');
  process.env.AI_THESIS_RATE_LIMIT_WHITELIST = original;
}

function testThesisCacheKeys() {
  const body = {
    ticker: 'dfns',
    scan: { droppinessScore: 42 },
  };
  assert(
    thesisCacheKey(body).startsWith('ai-thesis:DFNS:'),
    'exact cache key is uppercased ticker + hash'
  );
  assert(
    thesisTickerCacheKey('dfns') === 'ai-thesis:latest:DFNS',
    'ticker cache key shares latest thesis across users'
  );
}

async function testGroqDailyBudget() {
  const original = process.env.AI_THESIS_DAILY_GROQ_BUDGET;
  process.env.AI_THESIS_DAILY_GROQ_BUDGET = '2';
  assert(getGroqDailyBudgetLimit() === 2, 'daily Groq budget reads env override');

  const first = await checkGroqDailyBudget();
  assert(first.allowed === true, 'fresh daily budget allows calls');

  await recordGroqApiCall();
  await recordGroqApiCall();
  const blocked = await checkGroqDailyBudget();
  assert(blocked.allowed === false, 'daily Groq budget blocks after limit');
  assert(
    formatGroqBudgetError(3600, 2).includes('Shared AI thesis capacity'),
    'budget error explains shared capacity'
  );

  process.env.AI_THESIS_DAILY_GROQ_BUDGET = original;
}

async function main() {
  testWhitelist();
  testThesisCacheKeys();
  await testGroqDailyBudget();
  await testCallGroqSuccess();
  await testCallGroqRateLimit();
  await testCallOpenRouterSuccess();
  await testCallGroqNoKey();
  await testCallGroqNetworkError();
  await testLocalRateLimit();

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nALL AI THESIS ASSERTIONS PASSED');
}

main();
