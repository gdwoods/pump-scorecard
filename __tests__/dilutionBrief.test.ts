import { buildDilutionBrief, formatDilutionAsOf } from '../lib/dilution';
import { buildQuickScorecard } from '../lib/forensic/quickScorecard/buildQuickScorecard';
import type { CapitalPressureResult } from '../lib/capitalPressure/types';
import type { FastVerdict } from '../lib/fast/types';
import type { QuickScorecardInput } from '../lib/forensic/quickScorecard/types';

function baseVerdict(overrides: Partial<FastVerdict> = {}): FastVerdict {
  return {
    ticker: 'BNC',
    verdict: 'REVIEW',
    reason: null,
    elapsedMs: 12,
    dataCompleteness: 0.8,
    session: 'closed',
    price: { last: 3.49, todayMovePct: 0.12, volVs20d: 2, floatRotation: 0.4 },
    runner: { class: 'CLEAN', priorDayPct: 0.02, threeDayRunPct: 0.05, pctOff20dHigh: -0.1 },
    droppiness: { status: 'OK', score: 40, spikeCount: 2, computedAt: '2026-09-08T12:00:00.000Z' },
    filings: { today: [], daysSinceLast: 4 },
    fundamentals: {
      marketCap: 80_000_000,
      float: 36_450_000,
      instOwn: 0.08,
      shortInterest: 0.04,
      runwayMonths: 4,
    },
    borrow: { available: true, feePct: 12 },
    news: { class: 'NONE', headline: null, ageMinutes: null, source: null, matchedTerms: { fatal: [], weasel: [], ideal: [] }, tickerRecycleWarning: false },
    dilution: {
      publicFloatValue: 50_000_000,
      babyShelfCapacity: 8_000_000,
      capacityQuarters: 1.2,
      derivedOfferingAbility: 'HIGH',
      atmDetected: true,
      equityLineCounterparty: 'Cantor',
    },
    flags: [],
    unavailable: [],
    ...overrides,
  };
}

function baseCp(overrides: Partial<CapitalPressureResult> = {}): CapitalPressureResult {
  return {
    available: true,
    score: 72,
    status: 'high',
    dilutionLikelihood: 8,
    shortExecutionRisk: 4,
    summary: 'Live ATM plus registered capacity.',
    reasons: [
      {
        label: 'ATM program documented',
        points: 22,
        evidence: {
          form: 'S-3',
          filingDate: '2025-08-25',
          documentUrl: 'https://www.sec.gov/Archives/atm.htm',
          excerpt: 'ATM sales agreement',
        },
      },
    ],
    unknowns: ['Unused ATM balance dated Apr 30'],
    capacity: {
      status: 'reported',
      description: 'Cantor ATM on file',
      potentialShares: 11_315_000,
      evidence: {
        form: 'S-3',
        filingDate: '2025-08-25',
        documentUrl: 'https://www.sec.gov/Archives/atm.htm',
        excerpt: 'ATM',
      },
    },
    recentIssuance: { status: 'reported', shares7d: 0, shares30d: 0, shares90d: 0 },
    sharesOutstanding: { status: 'reported', value: 40_000_000, asOf: '2026-06-22' },
    events: [
      {
        id: 'atm-1',
        eventDate: '2025-08-25',
        type: 'atm_program',
        title: 'Cantor ATM',
        description: 'At-the-market sales agreement with Cantor Fitzgerald.',
        potentialShares: 11_315_000,
        evidence: {
          form: 'S-3',
          filingDate: '2025-08-25',
          documentUrl: 'https://www.sec.gov/Archives/atm.htm',
          excerpt: 'ATM sales agreement',
        },
      },
    ],
    scannedThrough: '2026-09-04',
    edgarSearchUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=BNC',
    ...overrides,
  };
}

function scorecardFrom(input: Partial<QuickScorecardInput> = {}) {
  return buildQuickScorecard({
    ticker: 'BNC',
    now: '2026-09-08T12:00:00.000Z',
    capitalPressure: {
      available: true,
      score: 72,
      status: 'high',
      dilutionLikelihood: 8,
      shortExecutionRisk: 4,
      recentIssuance: { status: 'reported', shares30d: 0 },
      events: [{ type: 'atm_program', eventDate: '2025-08-25' }],
      reasons: [{ label: 'ATM program documented', points: 22 }],
    },
    fastVerdict: {
      verdict: 'REVIEW',
      derivedOfferingAbility: 'HIGH',
      atmDetected: true,
      capacityQuarters: 1.2,
      borrowAvailable: true,
    },
    fundamentals: { float: 36_450_000, runwayMonths: 4 },
    ...input,
  });
}

describe('buildDilutionBrief', () => {
  it('passes through existing Quick Scorecard scores without inventing new math', () => {
    const qs = scorecardFrom();
    const brief = buildDilutionBrief({
      ticker: 'bnc',
      fastVerdict: baseVerdict(),
      quickScorecard: qs,
      capitalPressure: baseCp(),
    });

    expect(brief).not.toBeNull();
    expect(brief!.pillars.find((p) => p.id === 'need')?.score).toBe(qs.cashNeed.value);
    expect(brief!.pillars.find((p) => p.id === 'ability')?.score).toBe(qs.offering.value);
    expect(brief!.pillars.find((p) => p.id === 'incentive')?.score).toBe(qs.survivalPump.value);
    expect(brief!.finalRead.find((c) => c.id === 'squeeze')?.value).toContain(`${qs.squeeze.value}/10`);
  });

  it('features the ATM as the main weapon and can-dilute-yes when capacity is on file', () => {
    const brief = buildDilutionBrief({
      ticker: 'BNC',
      fastVerdict: baseVerdict(),
      quickScorecard: scorecardFrom(),
      capitalPressure: baseCp(),
    });

    expect(brief!.weapon.name).toMatch(/ATM/i);
    expect(brief!.weapon.heroValue).toMatch(/11\.32M|11.31M/);
    expect(brief!.weapon.heroAsOf).toBeTruthy();
    expect(brief!.finalRead.find((c) => c.id === 'canDilute')?.value).toBe('Yes');
    expect(brief!.pills.some((p) => /ATM/i.test(p.label))).toBe(true);
    expect(brief!.pills.some((p) => /catalyst/i.test(p.label))).toBe(true);
  });

  it('keeps Fast Verdict as the trade gate and offering band as the financing letter', () => {
    const qs = scorecardFrom();
    const brief = buildDilutionBrief({
      ticker: 'BNC',
      fastVerdict: baseVerdict({ verdict: 'NO_TRADE', reason: 'W9:runway' }),
      quickScorecard: qs,
      capitalPressure: baseCp(),
    });

    expect(brief!.tradeGate?.verdict).toBe('NO_TRADE');
    expect(brief!.overall.caption).toMatch(/not the Fast Verdict/i);
    expect(['A', 'B', 'C', 'D', 'E']).toContain(brief!.overall.letter);
  });

  it('stitches the 10-second read from the Short Check synopsis when present', () => {
    const brief = buildDilutionBrief({
      ticker: 'BNC',
      fastVerdict: baseVerdict(),
      quickScorecard: scorecardFrom(),
      capitalPressure: baseCp(),
      shortCheck: { synopsis: 'BNC has only 4.0 months of runway and active dilution tools.' },
    });

    expect(brief!.tenSecondRead).toMatch(/4\.0 months of runway/);
    expect(brief!.tenSecondRead).toMatch(/High —|ATM/i);
  });

  it('collects dated SEC sources from Capital Pressure evidence', () => {
    const brief = buildDilutionBrief({
      ticker: 'BNC',
      fastVerdict: baseVerdict(),
      quickScorecard: scorecardFrom(),
      capitalPressure: baseCp(),
    });

    expect(brief!.sources.length).toBeGreaterThan(0);
    expect(brief!.sources[0].url).toContain('sec.gov');
    expect(brief!.sources[0].asOf).toBe(formatDilutionAsOf('2025-08-25'));
  });

  it('treats a verified ATM as can-dilute-yes even when Fast Verdict offering ability is unknown', () => {
    const brief = buildDilutionBrief({
      ticker: 'BNC',
      fastVerdict: baseVerdict({
        dilution: {
          publicFloatValue: null,
          babyShelfCapacity: null,
          capacityQuarters: null,
          derivedOfferingAbility: 'UNKNOWN',
          atmDetected: false,
          equityLineCounterparty: null,
        },
      }),
      quickScorecard: scorecardFrom(),
      capitalPressure: baseCp(),
    });

    expect(brief!.finalRead.find((c) => c.id === 'canDilute')?.value).toBe('Yes');
    expect(brief!.weapon.whyItMatters).not.toMatch(/^…/);
  });

  it('maps LOW offering ability to cannot dilute today', () => {
    const brief = buildDilutionBrief({
      ticker: 'SAFE',
      fastVerdict: baseVerdict({
        ticker: 'SAFE',
        verdict: 'NO_TRADE',
        dilution: {
          publicFloatValue: null,
          babyShelfCapacity: null,
          capacityQuarters: 8,
          derivedOfferingAbility: 'LOW',
          atmDetected: false,
          equityLineCounterparty: null,
        },
        news: {
          class: 'NONE',
          headline: null,
          ageMinutes: null,
          source: null,
          matchedTerms: { fatal: [], weasel: [], ideal: [] },
          tickerRecycleWarning: false,
        },
      }),
      quickScorecard: scorecardFrom({
        ticker: 'SAFE',
        capitalPressure: { available: true, score: 10, status: 'low', dilutionLikelihood: 1 },
        fastVerdict: { derivedOfferingAbility: 'LOW', atmDetected: false, capacityQuarters: 8 },
        fundamentals: { runwayMonths: 24 },
      }),
      capitalPressure: baseCp({
        status: 'low',
        score: 10,
        dilutionLikelihood: 1,
        events: [],
        reasons: [],
        capacity: { status: 'unknown', description: '' },
      }),
    });

    expect(brief!.finalRead.find((c) => c.id === 'canDilute')?.value).toBe('No');
  });

  it('returns null without ticker or any source payload', () => {
    expect(buildDilutionBrief({ ticker: '' })).toBeNull();
    expect(buildDilutionBrief({ ticker: 'X' })).toBeNull();
  });

  it('prefers DT then SEC offering ability over a baby-shelf LOW', () => {
    const brief = buildDilutionBrief({
      ticker: 'MODD',
      fastVerdict: baseVerdict({
        ticker: 'MODD',
        dilution: {
          publicFloatValue: 20_000_000,
          babyShelfCapacity: 6_700_000,
          capacityQuarters: null,
          derivedOfferingAbility: 'LOW',
          atmDetected: true,
          equityLineCounterparty: null,
        },
      }),
      quickScorecard: scorecardFrom({
        ticker: 'MODD',
        capitalPressure: { available: true, score: 75, status: 'high', dilutionLikelihood: 9 },
        fastVerdict: { derivedOfferingAbility: 'LOW', atmDetected: true },
      }),
      capitalPressure: baseCp({
        score: 75,
        status: 'high',
        dilutionLikelihood: 9,
      }),
      shortCheck: { extracted: { ticker: 'MODD', confidence: 0.9, atmShelfStatus: 'DT:Red' } },
    });

    const ability = brief!.pillars.find((p) => p.id === 'ability');
    expect(ability?.rows.find((r) => r.label === 'Offering ability')?.value).toBe('HIGH · DT');
    expect(ability?.rows.find((r) => r.label === 'Baby-shelf screen')?.value).toBe('LOW');
    expect(brief!.finalRead.find((c) => c.id === 'canDilute')?.value).toBe('Yes');
  });

  it('uses SEC ATM/shelf as High when DT is absent and baby-shelf says Low', () => {
    const brief = buildDilutionBrief({
      ticker: 'MODD',
      fastVerdict: baseVerdict({
        ticker: 'MODD',
        dilution: {
          publicFloatValue: 20_000_000,
          babyShelfCapacity: 6_700_000,
          capacityQuarters: null,
          derivedOfferingAbility: 'LOW',
          atmDetected: true,
          equityLineCounterparty: null,
        },
      }),
      quickScorecard: scorecardFrom({
        ticker: 'MODD',
        capitalPressure: { available: true, score: 75, status: 'high', dilutionLikelihood: 9 },
        fastVerdict: { derivedOfferingAbility: 'LOW', atmDetected: true },
      }),
      capitalPressure: baseCp({
        score: 75,
        status: 'high',
        dilutionLikelihood: 9,
      }),
    });

    const ability = brief!.pillars.find((p) => p.id === 'ability');
    expect(ability?.rows.find((r) => r.label === 'Offering ability')?.value).toBe('HIGH · SEC');
    expect(ability?.rows.find((r) => r.label === 'Baby-shelf screen')?.value).toBe('LOW');
    expect(brief!.finalRead.find((c) => c.id === 'canDilute')?.value).toBe('Yes');
  });

  it('passes through the existing Short Rating without changing the number', () => {
    const brief = buildDilutionBrief({
      ticker: 'BNC',
      fastVerdict: baseVerdict(),
      quickScorecard: scorecardFrom(),
      shortCheck: {
        rating: 78.4,
        category: 'High-Priority Short Candidate',
        alertLabels: [{ label: 'BABY_SHELF_CRITICAL', color: 'red' }],
        dataCompleteness: 0.8,
      },
    });

    expect(brief!.shortRating).toEqual({
      rating: 78.4,
      category: 'High-Priority Short Candidate',
      alerts: [{ label: 'BABY_SHELF_CRITICAL', color: 'red' }],
      dataCompleteness: 0.8,
    });
  });
});
