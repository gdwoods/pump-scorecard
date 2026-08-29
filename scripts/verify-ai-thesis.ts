// scripts/verify-ai-thesis.ts
//
// Verifies the AI thesis feature's prompt-building and Groq-call plumbing
// without a live GROQ_API_KEY or network access, using the same injectable-
// fetcher pattern as lib/shortCheck/currentPriceFallback.ts.

import { buildThesisMessages } from '../lib/ai/buildThesisPrompt';
import { callGroq, type GroqFetcher } from '../lib/ai/groqClient';
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

// --- buildThesisMessages ---

const fullInput: ThesisPromptInput = {
  ticker: 'DFNS',
  now: '2026-08-29T00:00:00Z',
  shortCheck: {
    rating: 0,
    category: 'No-Trade',
    walkAwayFlags: ['Baby Shelf Critical (I.B.6): $21.31M annual shelf capacity ~ 39 days of burn'],
    alertLabels: [{ label: 'BABY_SHELF_CRITICAL', color: 'red' }],
    actualValues: { cashNeed: '$50.0M burn', offeringAbility: '$21.31M annual shelf capacity ~ 39 days of burn' },
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
    capitalPressure: {
      score: 77,
      status: 'high',
      summary: 'High capital pressure',
      reasons: [{ label: 'Active ATM/ELOC with confirmed draw', points: 22 }],
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

const userContent = messages[1].content;
assert(userContent.includes('DFNS'), 'user message includes ticker');
assert(userContent.includes('Baby Shelf Critical'), 'user message surfaces walk-away flags');
assert(userContent.includes('BINDING'), 'user message marks walk-away flags as binding');
assert(userContent.includes('2026-08-15'), 'user message includes catalyst date');
assert(userContent.includes('77/100'), 'user message includes Capital Pressure score');

// Minimal input (Short Check only, no scan/extractedData) should not throw.
const minimalMessages = buildThesisMessages({ ticker: 'ABCD' });
assert(minimalMessages.length === 2, 'buildThesisMessages handles minimal input without throwing');
assert(minimalMessages[1].content.includes('ABCD'), 'minimal user message still includes ticker');

// --- callGroq with an injected fetcher (no real network/key needed) ---

async function testCallGroqSuccess() {
  const mockFetcher: GroqFetcher = async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: '{"summary":"ok"}' } }] }),
      { status: 200 }
    );
  const originalKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-key';
  const result = await callGroq([{ role: 'user', content: 'hi' }], { fetcher: mockFetcher });
  process.env.GROQ_API_KEY = originalKey;
  assert(result.success === true, 'callGroq returns success on 200 with valid content');
  assert(result.content === '{"summary":"ok"}', 'callGroq returns the raw content string');
}

async function testCallGroqRateLimit() {
  const mockFetcher: GroqFetcher = async () => new Response('rate limited', { status: 429 });
  const originalKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-key';
  const result = await callGroq([{ role: 'user', content: 'hi' }], { fetcher: mockFetcher });
  process.env.GROQ_API_KEY = originalKey;
  assert(result.success === false, 'callGroq returns failure on 429');
  assert(!!result.error?.includes('rate limit'), 'callGroq surfaces a clear rate-limit message');
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

async function main() {
  await testCallGroqSuccess();
  await testCallGroqRateLimit();
  await testCallGroqNoKey();
  await testCallGroqNetworkError();

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nALL AI THESIS ASSERTIONS PASSED');
}

main();
