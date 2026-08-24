import * as fs from 'fs';
import * as path from 'path';
import {
  parseCapitalPressureDocuments,
  parseFilingDocument,
  stripHtml,
} from '../lib/capitalPressure/parse';
import { scoreCapitalPressure } from '../lib/capitalPressureScoring';
import { unavailableCapitalPressure } from '../lib/capitalPressure/unavailable';
import type { FilingDocumentInput, XbrlSnapshot } from '../lib/capitalPressure/types';

type Fixture = {
  name: string;
  asOf: string;
  windowStart: string;
  windowEnd: string;
  xbrl?: XbrlSnapshot;
  documents: FilingDocumentInput[];
};

function loadFixture(name: string): Fixture {
  const p = path.join(__dirname, 'fixtures', 'capitalPressure', `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Fixture;
}

function scoreFixture(name: string, context: Record<string, unknown> = {}) {
  const fix = loadFixture(name);
  const parsed = parseCapitalPressureDocuments(fix.documents, {
    windowStart: fix.windowStart,
    windowEnd: fix.windowEnd,
    xbrl: fix.xbrl,
    asOf: fix.asOf,
  });
  return scoreCapitalPressure({
    parsed,
    context: { asOf: fix.asOf, ...context },
  });
}

describe('capitalPressure parse', () => {
  it('strips HTML and keeps plain text', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('marks shelf as capacity, not issuance', () => {
    const fix = loadFixture('shelf-only');
    const s3 = fix.documents.find((d) => d.form === 'S-3')!;
    const parsed = parseFilingDocument(s3);
    const shelf = parsed.events.find((e) => e.type === 'shelf_registration');
    expect(shelf).toBeDefined();
    expect(shelf!.isCapacityOnly).toBe(true);
    expect(shelf!.sharesIssued).toBeUndefined();
    expect(shelf!.evidence.confidence).toBe('high');
  });

  it('detects equity-line draw as issuance with shares and proceeds', () => {
    const fix = loadFixture('equity-line-draw');
    const drawDoc = fix.documents.find((d) => d.accessionNumber === '0001213900-25-000021')!;
    const parsed = parseFilingDocument(drawDoc);
    const draw = parsed.events.find(
      (e) => e.type === 'equity_line' && !e.isCapacityOnly
    );
    expect(draw).toBeDefined();
    expect(draw!.sharesIssued).toBe(2500000);
    expect(draw!.grossProceedsUsd).toBe(1250000);
    expect(draw!.evidence.documentUrl).toContain('sec.gov');
  });

  it('detects going concern only with explicit language', () => {
    const fix = loadFixture('going-concern-10q');
    const parsed = parseFilingDocument(fix.documents[0]);
    expect(parsed.goingConcern?.present).toBe(true);
    expect(parsed.goingConcern?.evidence.excerpt.toLowerCase()).toMatch(
      /going concern|substantial doubt/
    );
  });

  it('does not infer going concern from losses alone', () => {
    const doc: FilingDocumentInput = {
      form: '10-Q',
      filingDate: '2025-05-01',
      documentUrl: 'https://example.com/10q.htm',
      text: 'The Company reported a net loss of $5,000,000 for the quarter ended March 31, 2025. Cash was $1,000,000.',
    };
    const parsed = parseFilingDocument(doc);
    expect(parsed.goingConcern).toBeUndefined();
  });

  it('puts needs_review on phrase matches without numeric/date context', () => {
    const doc: FilingDocumentInput = {
      form: '8-K',
      filingDate: '2025-01-01',
      accessionNumber: '0001',
      documentUrl: 'https://example.com/ek.htm',
      text: 'The Company may consider an at the market offering in the future.',
    };
    const parsed = parseFilingDocument(doc);
    const atm = parsed.events.find((e) => e.type === 'atm_program');
    expect(atm).toBeDefined();
    expect(atm!.evidence.confidence).toBe('needs_review');
  });

  it('always surfaces reverse split and nasdaq deficiency on timeline', () => {
    const fix = loadFixture('reverse-split-nasdaq');
    const parsed = parseCapitalPressureDocuments(fix.documents, {
      windowStart: fix.windowStart,
      windowEnd: fix.windowEnd,
      asOf: fix.asOf,
    });
    expect(parsed.events.some((e) => e.type === 'reverse_split')).toBe(true);
    expect(parsed.events.some((e) => e.type === 'nasdaq_deficiency')).toBe(true);
  });
});

describe('capitalPressure scoring fixtures', () => {
  it('shelf-only: capacity reported, no issuance asserted, modest shelf points', () => {
    const result = scoreFixture('shelf-only');
    expect(result.available).toBe(true);
    expect(result.capacity.status).toBe('reported');
    expect(result.capacity.amountUsd).toBe(50000000);
    expect(result.recentIssuance.status).toBe('unknown');
    expect(result.recentIssuance.shares30d).toBeUndefined();
    expect(result.score).toBe(10);
    expect(result.status).toBe('low');
    expect(result.reasons.some((r) => r.label.includes('shelf'))).toBe(true);
    expect(result.reasons.every((r) => r.evidence)).toBe(true);
    // No issuance language from S-3 alone
    expect(result.events.every((e) => e.type !== 'registered_direct')).toBe(true);
  });

  it('equity-line draw: issuance totals and ATM/ELOC points capped at 22', () => {
    const result = scoreFixture('equity-line-draw');
    expect(result.recentIssuance.status).toBe('reported');
    expect(result.recentIssuance.shares30d).toBe(2500000);
    expect(result.recentIssuance.shares90d).toBe(2500000);
    expect(result.recentIssuance.proceeds30dUsd).toBe(1250000);

    const atmReason = result.reasons.find(
      (r) => r.label.toLowerCase().includes('atm') || r.label.toLowerCase().includes('equity line')
    );
    expect(atmReason).toBeDefined();
    expect(atmReason!.points).toBeLessThanOrEqual(22);
    expect(atmReason!.points).toBe(22); // 18 + 4 draw
    expect(result.score).toBeGreaterThanOrEqual(22);
    expect(['watch', 'elevated', 'high']).toContain(result.status);
  });

  it('10-Q going concern + cash burn + WC deficit: 25+15+12', () => {
    const result = scoreFixture('going-concern-10q');
    const labels = result.reasons.map((r) => r.label);
    expect(labels.some((l) => l.includes('going-concern'))).toBe(true);
    expect(labels.some((l) => l.includes('Cash runway'))).toBe(true);
    expect(labels.some((l) => l.includes('working capital'))).toBe(true);

    const gc = result.reasons.find((r) => r.label.includes('going-concern'))!;
    const runway = result.reasons.find((r) => r.label.includes('Cash runway'))!;
    const wc = result.reasons.find((r) => r.label.includes('working capital'))!;
    expect(gc.points).toBe(25);
    expect(runway.points).toBe(15);
    expect(wc.points).toBe(12);
    expect(wc.evidence.excerpt).toMatch(/WC\/assets/i);
    expect(result.score).toBe(25 + 15 + 12);
    expect(result.status).toBe('elevated');
  });

  it('losses without going-concern language score 0 for that criterion', () => {
    const parsed = parseCapitalPressureDocuments(
      [
        {
          form: '10-Q',
          filingDate: '2025-05-01',
          accessionNumber: 'x',
          documentUrl: 'https://example.com/10q.htm',
          text: 'Net loss was $10,000,000 for the quarter. Cash was $500,000 as of March 31, 2025.',
        },
      ],
      {
        windowStart: '2023-06-15',
        windowEnd: '2025-06-15',
        asOf: '2025-06-15',
        xbrl: {
          cashUsd: 500000,
          cashAsOf: '2025-03-31',
          operatingCashFlowUsd: -3000000,
          ocfAsOf: '2025-03-31',
        },
      }
    );
    const result = scoreCapitalPressure({
      parsed,
      context: { asOf: '2025-06-15' },
    });
    expect(result.reasons.every((r) => !r.label.includes('going-concern'))).toBe(true);
    expect(result.score).toBe(15); // runway only
  });

  it('reverse split + Nasdaq: timeline events; RS scores 10; not counted as financing', () => {
    const result = scoreFixture('reverse-split-nasdaq');
    expect(result.events.some((e) => e.type === 'reverse_split')).toBe(true);
    expect(result.events.some((e) => e.type === 'nasdaq_deficiency')).toBe(true);

    const rs = result.reasons.find((r) => r.label.includes('Reverse split'));
    expect(rs?.points).toBe(10);
    const def = result.reasons.find((r) => r.label.includes('Nasdaq deficiency'));
    expect(def?.points).toBe(8);
    // No ATM/shelf/RD financing reasons from these filings alone
    expect(result.reasons.every((r) => !r.label.toLowerCase().includes('shelf'))).toBe(true);
    expect(result.score).toBe(18); // 10 + 8
  });

  it('ordinary issuer: score 0, unknowns populated, unknown never looks like zero issuance', () => {
    const result = scoreFixture('ordinary-issuer');
    expect(result.score).toBe(0);
    expect(result.status).toBe('low');
    expect(result.unknowns.length).toBeGreaterThan(0);
    expect(result.capacity.status).toBe('unknown');
    expect(result.capacity.description).toMatch(/Not verified/i);
    expect(result.recentIssuance.status).toBe('unknown');
    expect(result.recentIssuance.shares7d).toBeUndefined();
    expect(result.sharesOutstanding.status).toBe('reported');
    expect(result.sharesOutstanding.value).toBe(50000000);
  });

  it('unavailable SEC returns neutral object, never high risk', () => {
    const result = scoreCapitalPressure({
      unavailableReason: 'SEC submissions fetch failed',
      context: { asOf: '2025-06-15' },
    });
    expect(result.available).toBe(false);
    expect(result.score).toBe(0);
    expect(result.status).toBe('low');
    expect(result.reasons).toHaveLength(0);
    expect(result.unavailableReason).toMatch(/SEC/);
    expect(result.capacity.description).toMatch(/Not verified/i);
  });

  it('needs_review events award no automatic points', () => {
    const parsed = parseCapitalPressureDocuments(
      [
        {
          form: '8-K',
          filingDate: '2025-05-01',
          accessionNumber: 'nr-1',
          documentUrl: 'https://example.com/ek.htm',
          text: 'The Company may pursue an at the market offering.',
        },
        {
          form: '10-Q',
          filingDate: '2025-05-10',
          accessionNumber: 'nr-2',
          documentUrl: 'https://example.com/10q.htm',
          text: 'Quarterly report with no financing disclosures.',
        },
      ],
      {
        windowStart: '2023-06-15',
        windowEnd: '2025-06-15',
        asOf: '2025-06-15',
      }
    );
    const atm = parsed.events.find((e) => e.type === 'atm_program');
    expect(atm?.evidence.confidence).toBe('needs_review');
    const result = scoreCapitalPressure({
      parsed,
      context: { asOf: '2025-06-15' },
    });
    expect(result.score).toBe(0);
    expect(result.events.some((e) => e.type === 'atm_program')).toBe(true);
  });

  it('dilutionLikelihood scales score and adds 30-day financing bonus capped at 10', () => {
    const result = scoreFixture('equity-line-draw');
    // score includes 22 ATM + possibly runway from xbrl
    expect(result.dilutionLikelihood).toBeGreaterThanOrEqual(3);
    expect(result.dilutionLikelihood).toBeLessThanOrEqual(10);
    // Bonus path: confirmed draw within 30d
    const expectedBase = Math.round(result.score / 10);
    expect(result.dilutionLikelihood).toBe(Math.min(10, expectedBase + 1));
  });

  it('shortExecutionRisk increments only for documented signals', () => {
    const result = scoreCapitalPressure({
      parsed: {
        events: [
          {
            id: 'rs',
            eventDate: '2025-05-01',
            type: 'reverse_split',
            title: 'Reverse stock split',
            description: '1-for-10 reverse stock split on May 1, 2025',
            evidence: {
              form: '8-K',
              filingDate: '2025-05-01',
              documentUrl: 'https://example.com',
              excerpt: '1-for-10 reverse stock split on May 1, 2025',
              confidence: 'high',
            },
          },
        ],
        fundamentals: { goingConcern: { present: false } },
        windowStart: '2023-06-15',
        windowEnd: '2025-06-15',
        scannedThrough: '2025-06-15',
      },
      context: {
        asOf: '2025-06-15',
        floatShares: null,
        shortFloat: null,
        borrowFee: 'Manual Check',
        news: [
          {
            title: 'Company announces strategic partnership with BigCo',
            date: '2025-06-10',
          },
        ],
        droppinessScore: 25,
        droppinessSpikeCount: 4,
      },
    });
    // RS 90d +2, float missing +2, short/borrow +2, news +2, droppiness +2 = 10
    expect(result.shortExecutionRisk).toBe(10);
  });

  it('undated but present float does not trigger float-age penalty', () => {
    const result = scoreCapitalPressure({
      parsed: {
        events: [],
        fundamentals: {},
        windowStart: '2023-06-15',
        windowEnd: '2025-06-15',
        scannedThrough: '2025-06-15',
      },
      context: {
        asOf: '2025-06-15',
        floatShares: 10_000_000,
        // no floatAsOf
        shortFloat: 5,
        borrowFee: '12.5',
        borrowAvailable: '50000',
        droppinessScore: 80,
        droppinessSpikeCount: 5,
      },
    });
    expect(result.shortExecutionRisk).toBe(0);
  });

  it('score reasons sorted descending and each has SEC evidence', () => {
    const result = scoreFixture('going-concern-10q');
    for (let i = 1; i < result.reasons.length; i++) {
      expect(result.reasons[i - 1].points).toBeGreaterThanOrEqual(result.reasons[i].points);
    }
    for (const r of result.reasons) {
      expect(r.evidence.excerpt.length).toBeGreaterThan(0);
      expect(r.evidence.excerpt.length).toBeLessThanOrEqual(280);
    }
  });

  it('score clamps at 100', () => {
    // Stack many high-confidence financing events
    const events = [];
    const mk = (type: string, date: string, extra: Record<string, unknown> = {}) => ({
      id: `${type}-${date}`,
      eventDate: date,
      type,
      title: type,
      description: 'test',
      isCapacityOnly: type === 'shelf_registration' || type === 'atm_program',
      evidence: {
        form: '8-K',
        filingDate: date,
        documentUrl: 'https://example.com',
        excerpt: 'documented fact with $1,000,000 and January 1, 2025',
        confidence: 'high' as const,
      },
      ...extra,
    });
    events.push(mk('atm_program', '2025-05-01', { sharesIssued: 1000, isCapacityOnly: false }));
    events.push(mk('shelf_registration', '2025-04-01', { isCapacityOnly: true }));
    events.push(mk('registered_direct', '2025-05-10', { sharesIssued: 5000, isCapacityOnly: false }));
    events.push(
      mk('convertible_note', '2025-03-01', {
        isCapacityOnly: true,
        description: 'convertible note at 90% of the lowest daily VWAP',
        evidence: {
          form: '8-K',
          filingDate: '2025-03-01',
          documentUrl: 'https://example.com',
          excerpt: 'convertible note conversion at 90% of the lowest daily VWAP as of March 1, 2025',
          confidence: 'high',
        },
      })
    );
    events.push(mk('debt_for_equity', '2025-05-05', { sharesIssued: 100, isCapacityOnly: false }));
    events.push(mk('reverse_split', '2025-04-15'));
    events.push(mk('nasdaq_deficiency', '2025-02-01'));

    const result = scoreCapitalPressure({
      parsed: {
        events: events as any,
        fundamentals: {
          goingConcern: {
            present: true,
            evidence: {
              form: '10-Q',
              filingDate: '2025-05-01',
              documentUrl: 'https://example.com',
              excerpt: 'substantial doubt about the Company ability to continue as a going concern as of March 31, 2025',
              confidence: 'high',
            },
          },
          cashUsd: 100000,
          cashAsOf: '2025-03-31',
          operatingCashFlowUsd: -3000000,
          ocfAsOf: '2025-03-31',
          currentAssetsUsd: 100000,
          currentLiabilitiesUsd: 5000000,
          totalAssetsUsd: 6000000,
          balanceSheetAsOf: '2025-03-31',
        },
        windowStart: '2023-06-15',
        windowEnd: '2025-06-15',
        scannedThrough: '2025-06-15',
      },
      context: { asOf: '2025-06-15' },
    });
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBe(100);
  });

  it('unavailableCapitalPressure factory is neutral', () => {
    const u = unavailableCapitalPressure('timeout');
    expect(u.available).toBe(false);
    expect(u.score).toBe(0);
    expect(u.status).toBe('low');
  });

  it('does not double-count reverse split as financing', () => {
    const result = scoreFixture('reverse-split-nasdaq');
    const financingTypes = result.reasons.filter((r) =>
      /ATM|shelf|Registered direct|Convertible|Debt-for-equity|equity line/i.test(r.label)
    );
    expect(financingTypes).toHaveLength(0);
    expect(result.reasons.filter((r) => r.label.includes('Reverse split'))).toHaveLength(1);
  });
});
