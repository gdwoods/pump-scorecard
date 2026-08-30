// scripts/verify-forensic-brief.ts
//
// Verifies forensic brief plain-text and PDF rendering without network.

import { buildForensicFactPack } from '../lib/forensic/buildFactPack';
import {
  buildBriefSections,
  formatBriefPlainText,
  formatProseForExport,
} from '../lib/forensic/formatBriefForExport';
import { renderForensicBriefPdf } from '../lib/forensic/renderForensicBriefPdf';
import { sanitizePdfText } from '../lib/forensic/sanitizePdfText';
import type { AiThesisResult, ThesisPromptInput } from '../lib/ai/types';

let failures = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

const input: ThesisPromptInput = {
  ticker: 'DFNS',
  now: '2026-08-29T00:00:00Z',
  fastVerdict: {
    verdict: 'NO_TRADE',
    reason: 'Baby shelf critical',
    flags: ['Baby Shelf Critical (I.B.6)'],
    runnerClass: 'CLEAN',
    priorDayPct: 5,
    threeDayRunPct: 12,
    droppinessStatus: 'OK',
    droppinessScore: 72,
    newsClass: 'NEUTRAL',
    newsHeadline: 'Announces reverse split',
    babyShelfCapacity: 21.31e6,
    capacityQuarters: 0.3,
    derivedOfferingAbility: 'HIGH',
    borrowAvailable: true,
    borrowFeePct: 2,
    dataCompleteness: 0.9,
    unavailable: [],
  },
  shortCheck: {
    rating: 0,
    category: 'No-Trade',
    walkAwayFlags: ['Baby Shelf Critical'],
    alertLabels: [{ label: 'BABY_SHELF_CRITICAL', color: 'red' }],
    actualValues: { offeringAbility: '$21.31M shelf' },
    dataCompleteness: 0.42,
  },
  extractedData: {
    currentPrice: 3.2,
    atmShelfStatus: 'DT:Red',
    float: 2e6,
  },
  scan: {
    droppinessScore: 72,
    capitalPressure: {
      available: true,
      score: 77,
      status: 'high',
      summary: 'High capital pressure',
      dilutionLikelihood: 8,
      shortExecutionRisk: 3,
      recentIssuance: { shares30d: 500_000, status: 'reported' },
      reasons: [
        {
          label: 'Active ATM/ELOC',
          points: 22,
          evidence: {
            form: '10-Q',
            filingDate: '2026-08-01',
            excerpt: 'Issued shares under ELOC.',
          },
        },
      ],
    },
    fundamentals: {
      price: 3.2,
      marketCap: 20e6,
      floatShares: 2.1e6,
    },
  },
};

const thesis: AiThesisResult = {
  summary: 'Binding baby-shelf walk-away.',
  thesis: 'OPINION: Setup favors fade after spike.',
  regulatoryAlert: 'Baby shelf critical — binding.',
  rubricNarrative: 'DT Red aligns with CP ATM evidence.',
  ceoLens: 'OPINION: Issuer needs shelf refresh.',
  traderLens: 'VERIFY: Borrow not reconfirmed.',
  catalysts: [
    {
      description: 'Reverse split',
      date: '2026-08-15',
      significance: 'high',
      rationale: 'Material corporate action.',
    },
  ],
  forwardDates: [
    { date: '2026-09-15', event: 'Compliance deadline', significance: 'high', tag: 'verify' },
  ],
  dataGaps: ['VERIFY: Warrant table missing'],
  keyRisks: ['Borrow dries up'],
  model: 'test-model',
  generatedAt: '2026-08-29T12:00:00.000Z',
  reportVersion: 'forensic-brief-v1',
};

const factPack = buildForensicFactPack(input);
assert(factPack.ticker === 'DFNS', 'fact pack normalizes ticker');
assert(factPack.alerts.length >= 2, 'fact pack includes walk-away alerts');
assert(factPack.quickScorecard != null, 'fact pack includes quick scorecard');
assert(
  factPack.quickScorecard?.offering.value === 8,
  'fact pack quick scorecard maps CP dilution likelihood'
);

assert(
  formatProseForExport('VERIFY: Missing data.') === '[VERIFY] Missing data.',
  'formatProseForExport strips inline prefix'
);

const sections = buildBriefSections(factPack, thesis);
assert(sections.some((s) => s.title.includes('Quick Scorecard')), 'brief includes quick scorecard section');
assert(sections.some((s) => s.title.includes('Snapshot')), 'brief includes snapshot section');
assert(sections.some((s) => s.title.includes('Thesis')), 'brief includes thesis section');
assert(sections.some((s) => s.title.includes('Forward dates')), 'brief includes forward dates');

const plain = formatBriefPlainText(factPack, thesis);
assert(plain.includes('FORENSIC BRIEF — DFNS'), 'plain text header');
assert(plain.includes('Quick Scorecard'), 'plain text includes quick scorecard');
assert(plain.includes('DISCLAIMER'), 'plain text disclaimer');
assert(plain.includes('[OPINION]'), 'plain text preserves opinion tag');

assert(
  sanitizePdfText('Baby\u2011shelf critical') === 'Baby-shelf critical',
  'sanitizePdfText maps non-breaking hyphen'
);
assert(
  sanitizePdfText('walk\u2014away') === 'walk-away',
  'sanitizePdfText maps em dash'
);

async function testPdf() {
  const thesisWithUnicode: AiThesisResult = {
    ...thesis,
    thesis: 'OPINION: Non\u2011breaking hyphen and em\u2014dash test.',
  };
  const bytes = await renderForensicBriefPdf(factPack, thesisWithUnicode);
  const header = Buffer.from(bytes.slice(0, 5)).toString('ascii');
  assert(header === '%PDF-', 'renderForensicBriefPdf returns valid PDF header');
  assert(bytes.length > 500, 'PDF has reasonable size');
}

async function main() {
  await testPdf();
  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nALL FORENSIC BRIEF ASSERTIONS PASSED');
}

main();
