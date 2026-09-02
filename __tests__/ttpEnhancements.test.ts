import {
  computePercentOfFloat,
  eventPercentOfFloat,
  formatPercentOfFloat,
  getEventIssuanceStatus,
  issuanceStatusLabel,
} from '../lib/capitalPressure/eventLabels';
import type { CapitalEvent } from '../lib/capitalPressure/types';
import { extractNasdaqCureDate, inferEventCertainty } from '../lib/capitalPressure/certainty';
import { parseForm4Xml, parseForm144Xml } from '../utils/parseSecInsiderForms';

function mkEvent(partial: Partial<CapitalEvent>): CapitalEvent {
  return {
    id: 'test-1',
    eventDate: '2026-01-15',
    type: 'registered_direct',
    title: 'Test',
    description: 'Test event',
    evidence: {
      form: '8-K',
      filingDate: '2026-01-15',
      documentUrl: 'https://sec.gov',
      excerpt: 'test',
      confidence: 'high',
    },
    ...partial,
  };
}

describe('eventLabels', () => {
  it('labels capacity-only events as Filed', () => {
    const e = mkEvent({ isCapacityOnly: true, type: 'atm_program' });
    expect(getEventIssuanceStatus(e)).toBe('filed');
    expect(issuanceStatusLabel('filed')).toBe('Filed');
  });

  it('labels issued shares as Issued', () => {
    const e = mkEvent({ sharesIssued: 1_000_000, isCapacityOnly: false });
    expect(getEventIssuanceStatus(e)).toBe('issued');
  });

  it('computes percent of float', () => {
    expect(formatPercentOfFloat(computePercentOfFloat(500_000, 10_000_000))).toBe('5.00% of float');
    const e = mkEvent({ sharesIssued: 2_000_000 });
    expect(eventPercentOfFloat(e, 10_000_000)).toBe('20.0% of float');
  });
});

describe('certainty', () => {
  it('extracts 180-day cure from deficiency text', () => {
    const date = extractNasdaqCureDate(
      'The Company has 180 calendar days to regain compliance.',
      '2026-01-01'
    );
    expect(date).toBe('2026-06-30');
  });

  it('marks contingent reverse split as Possible', () => {
    const e = mkEvent({
      type: 'reverse_split',
      isUpcoming: true,
      description: 'subject to shareholder approval',
    });
    expect(inferEventCertainty(e)).toBe('possible');
  });

  it('marks dated deficiency with cure as Set', () => {
    const e = mkEvent({
      type: 'nasdaq_deficiency',
      cureDate: '2026-07-01',
      description: 'minimum bid price deficiency',
    });
    expect(inferEventCertainty(e)).toBe('set');
  });
});

describe('parseSecInsiderForms', () => {
  it('parses Form 4 non-derivative transaction', () => {
    const xml = `
      <ownershipDocument>
        <reportingOwner>
          <reportingOwnerId>
            <rptOwnerName>Jane Doe</rptOwnerName>
          </reportingOwnerId>
          <reportingOwnerRelationship>
            <officerTitle>CEO</officerTitle>
          </reportingOwnerRelationship>
        </reportingOwner>
        <nonDerivativeTransaction>
          <transactionDate><value>2026-03-01</value></transactionDate>
          <transactionShares><value>5000</value></transactionShares>
          <transactionPricePerShare><value>1.25</value></transactionPricePerShare>
          <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
        </nonDerivativeTransaction>
      </ownershipDocument>`;
    const rows = parseForm4Xml(xml, '2026-03-01');
    expect(rows).toHaveLength(1);
    expect(rows[0].transactionType).toBe('sell');
    expect(rows[0].shares).toBe(5000);
    expect(rows[0].insiderName).toBe('Jane Doe');
  });

  it('parses Form 144 intent to sell', () => {
    const xml = `
      <edgarSubmission>
        <reportingOwner>
          <rptOwnerName>John Smith</rptOwnerName>
          <officerTitle>Director</officerTitle>
        </reportingOwner>
        <noOfUnitsSold>12000</noOfUnitsSold>
        <approxSaleDate>2026-04-15</approxSaleDate>
      </edgarSubmission>`;
    const rows = parseForm144Xml(xml, '2026-04-01');
    expect(rows[0].transactionType).toBe('intent_to_sell');
    expect(rows[0].shares).toBe(12000);
  });
});
