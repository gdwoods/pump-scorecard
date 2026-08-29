import {
  buildCapitalPressureHeadline,
  buildFrameworkNote,
  evidenceAvailabilityText,
  issuanceWindowSummary,
  humanEventType,
} from '../lib/capitalPressure/cardCopy';
import type { CapitalPressureResult } from '../lib/capitalPressure/types';

function baseResult(overrides: Partial<CapitalPressureResult> = {}): CapitalPressureResult {
  return {
    available: true,
    score: 40,
    status: 'watch',
    dilutionLikelihood: 4,
    shortExecutionRisk: 3,
    summary: 'Test summary',
    reasons: [{ label: 'ATM program documented', points: 15, evidence: { form: 'S-3', filingDate: '2026-01-01', documentUrl: 'https://sec.gov', excerpt: 'ATM' } }],
    unknowns: [],
    capacity: { status: 'reported', description: 'Shelf registration on file' },
    recentIssuance: { status: 'reported', shares7d: 0, shares30d: 0, shares90d: 0 },
    sharesOutstanding: { status: 'unknown' },
    events: [],
    scannedThrough: '2026-08-29',
    criteriaVerified: 6,
    criteriaTotal: 10,
    ...overrides,
  };
}

describe('capitalPressure cardCopy', () => {
  it('builds headline for low quiet issuer', () => {
    const h = buildCapitalPressureHeadline(
      baseResult({ status: 'low', score: 12, reasons: [] })
    );
    expect(h).toMatch(/^Low —/);
    expect(h).toMatch(/no verified issuance/i);
  });

  it('humanizes event types', () => {
    expect(humanEventType('registered_direct')).toBe('Registered direct');
  });

  it('distinguishes unknown vs verified-none issuance windows', () => {
    const unknown = issuanceWindowSummary({ status: 'unknown' });
    expect(unknown.d90).toMatch(/Not in scanned filings/i);

    const none = issuanceWindowSummary({ status: 'reported', shares90d: 0, shares30d: 0, shares7d: 0 });
    expect(none.d90).toMatch(/No issuance \(verified\)/i);
  });

  it('evidenceAvailabilityText uses softer copy', () => {
    expect(evidenceAvailabilityText('unknown')).toBe('Not in scanned filings');
    expect(evidenceAvailabilityText('reported', 'issuance')).toMatch(/No issuance in 90d/i);
  });

  it('framework note warns on DT/SEC disagreement', () => {
    const note = buildFrameworkNote(baseResult({ score: 60 }), {
      extractedData: { ticker: 'X', confidence: 1, atmShelfStatus: 'dt:Green' },
    });
    expect(note?.tone).toBe('warn');
  });

  it('framework note shows baby shelf when provided', () => {
    const note = buildFrameworkNote(baseResult(), { capacityQuarters: 0.41 });
    expect(note?.text).toMatch(/Baby-shelf capacity/);
  });
});
