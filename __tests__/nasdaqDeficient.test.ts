import {
  appendNasdaqListingFlag,
  listingFromIndex,
  parseNasdaqDeficientPayload,
} from '../lib/fast/fetchNasdaqDeficient';
import { formatFastVerdictText } from '../lib/fast/formatText';
import type { FastVerdict } from '../lib/fast/types';

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

describe('Nasdaq deficient list parser', () => {
  const index = parseNasdaqDeficientPayload(fixture);

  it('indexes a simple issuer by affected symbol', () => {
    const listing = listingFromIndex(index, 'aidx');
    expect(listing.status).toBe('noncompliant');
    expect(listing.issuerName).toBe('20/20 Biolabs, Inc.');
    expect(listing.market).toBe('NCM');
    expect(listing.deficiencies).toEqual([
      { type: 'Bid Price', notificationDate: '7/17/2026' },
    ]);
  });

  it('merges multiple deficiency rows for the same ticker', () => {
    const listing = listingFromIndex(index, 'ADGM');
    expect(listing.status).toBe('noncompliant');
    expect(listing.deficiencies.map((d) => d.type)).toEqual(['Bid Price', 'Equity']);
    expect(appendNasdaqListingFlag([], listing)[0]).toContain('Bid Price (6/12/2026)');
    expect(appendNasdaqListingFlag([], listing)[0]).toContain('Equity (8/13/2026)');
  });

  it('indexes warrants and units as their own symbols', () => {
    expect(listingFromIndex(index, 'ASPCU').status).toBe('noncompliant');
    expect(listingFromIndex(index, 'ASPC').status).toBe('noncompliant');
    expect(listingFromIndex(index, 'ASPCR').status).toBe('noncompliant');
  });

  it('returns not_listed for names absent from the feed', () => {
    const listing = listingFromIndex(index, 'AAPL');
    expect(listing.status).toBe('not_listed');
    expect(listing.deficiencies).toEqual([]);
    expect(appendNasdaqListingFlag(['other'], listing)).toEqual(['other']);
  });

  it('rejects a malformed payload', () => {
    expect(() => parseNasdaqDeficientPayload({ data: {} })).toThrow(
      /nasdaq deficient list empty/
    );
  });

  it('includes Nasdaq line in text format without changing verdict', () => {
    const verdict: FastVerdict = {
      ticker: 'ADGM',
      verdict: 'REVIEW',
      reason: null,
      elapsedMs: 10,
      dataCompleteness: 1,
      session: 'open',
      price: { last: 1, todayMovePct: 0.4, volVs20d: 2, floatRotation: 0.1 },
      runner: {
        class: 'CLEAN',
        priorDayPct: 0.01,
        threeDayRunPct: 0.02,
        pctOff20dHigh: -0.1,
      },
      droppiness: {
        status: 'OK',
        score: 70,
        spikeCount: 4,
        computedAt: null,
      },
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
      nasdaqListing: listingFromIndex(index, 'ADGM'),
      flags: appendNasdaqListingFlag([], listingFromIndex(index, 'ADGM')),
      unavailable: [],
    };
    const text = formatFastVerdictText(verdict);
    expect(text).toContain('ADGM  REVIEW');
    expect(text).toContain('Nasdaq  NONCOMPLIANT');
    expect(text).toContain('Bid Price (6/12/2026)');
  });
});
