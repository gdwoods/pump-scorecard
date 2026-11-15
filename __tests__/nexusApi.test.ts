import { buildNexusApiResponse, NEXUS_ATTRIBUTION } from '../lib/nexus/buildApiResponse';
import { buildNexusFilingKey } from '../lib/nexus/filingKey';
import type { OperatingNexus } from '../lib/nexus/detectOperatingNexus';

describe('nexus API mapping', () => {
  it('maps flagged AIMD-style nexus', () => {
    const operatingNexus: OperatingNexus = {
      places: ['Taiwan', 'Cayman Islands'],
      headline:
        'Listed in the US. Filings tie operations or control to Taiwan and the Cayman Islands.',
      evidence: [
        {
          form: 'DEF 14A',
          filingDate: '2026-11-10',
          documentUrl: 'https://www.sec.gov/example/def14a',
          excerpt: 'Meeting in Taiwan.',
          places: ['Taiwan'],
        },
      ],
    };

    const res = buildNexusApiResponse({
      ticker: 'aimd',
      country: 'United States',
      operatingNexus,
    });

    expect(res.ticker).toBe('AIMD');
    expect(res.status).toBe('flagged');
    expect(res.overseas).toBe(true);
    expect(res.countries).toEqual(['Taiwan', 'Cayman Islands']);
    expect(res.reason).toContain('Taiwan');
    expect(res.evidenceUrl).toBe('https://www.sec.gov/example/def14a');
    expect(res.asOf).toBe('2026-11-10');
    expect(res.attribution).toBe(NEXUS_ATTRIBUTION);
    expect(res.attributionUrl).toMatch(/^https:\/\//);
  });

  it('returns clear when US-listed and no nexus', () => {
    const res = buildNexusApiResponse({
      ticker: 'AAPL',
      country: 'USA',
      operatingNexus: null,
    });
    expect(res.status).toBe('clear');
    expect(res.overseas).toBe(false);
    expect(res.countries).toEqual([]);
  });

  it('returns not_applicable for non-US SEC domicile', () => {
    const res = buildNexusApiResponse({
      ticker: 'BABA',
      country: 'China',
    });
    expect(res.status).toBe('not_applicable');
    expect(res.overseas).toBe(false);
  });

  it('returns unknown when SEC context is unavailable', () => {
    const res = buildNexusApiResponse({
      ticker: 'ZZZZ',
      secUnavailable: true,
    });
    expect(res.status).toBe('unknown');
    expect(res.overseas).toBe(false);
  });

  it('returns unknown when filing documents cannot be loaded', () => {
    const res = buildNexusApiResponse({
      ticker: 'XYZ',
      country: 'United States',
      documentsUnavailable: true,
    });
    expect(res.status).toBe('unknown');
  });
});

describe('nexus filing cache key', () => {
  it('changes when proxy filing date changes', () => {
    const cik = '0001234567';
  const a = buildNexusFilingKey(cik, [
      { form: '10-K', filingDate: '2026-03-30', documentUrl: 'u1' },
      { form: 'DEF 14A', filingDate: '2026-05-01', documentUrl: 'u2' },
    ]);
    const b = buildNexusFilingKey(cik, [
      { form: '10-K', filingDate: '2026-03-30', documentUrl: 'u1' },
      { form: 'DEF 14A', filingDate: '2026-11-10', documentUrl: 'u3' },
    ]);
    expect(a).not.toBe(b);
  });
});