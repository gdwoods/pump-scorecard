jest.mock('next/cache', () => {
  const store = new Map<string, unknown>();
  (globalThis as { __dtDurable?: Map<string, unknown> }).__dtDurable = store;
  return {
    // Mirrors unstable_cache: stores successful results only. Throws are not cached.
    unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[]) =>
      async (...args: unknown[]) => {
        const map = (globalThis as { __dtDurable?: Map<string, unknown> }).__dtDurable!;
        const key = JSON.stringify([keyParts, args]);
        if (map.has(key)) return map.get(key);
        const value = await fn(...args);
        map.set(key, value);
        return value;
      },
  };
});

import type { Tier2Bundle } from '../lib/fast/fetchTier2';
import { buildFastVerdict } from '../lib/fast/evaluate';
import { formatFastVerdictText } from '../lib/fast/formatText';
import {
  fetchDtCashPosition,
  fetchDtCompanyProfile,
  fetchDtMajorDevelopments,
  fetchDtReverseSplits,
  parseCashPosition,
  parseCompanyProfile,
  parseDevelopments,
  parseReverseSplits,
  toRunwayContext,
  type CompanyProfileBody,
} from '../lib/dilutiontracker/fetchers';
import {
  detectUpcomingReverseSplitFromDilutionTracker,
  mergeUpcomingReverseSplit,
} from '../lib/capitalPressure/upcomingReverseSplit';
import type { CapitalEvent } from '../lib/capitalPressure/types';
import { evaluateWalkAways } from '../lib/fast/walkAway';
import type { FastVerdict } from '../lib/fast/types';

const ORIGINAL_KEY = process.env.DILUTIONTRACKER_API_KEY;
const ASOF = '2026-11-27T15:00:00.000Z';

// Jest runs without the fetch Response global, so use a minimal stand-in.
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

function problem(status: number, type: string) {
  return jsonResponse(status, { type, title: 'x', status, detail: 'x' });
}

function skipBundle(overrides: Partial<Tier2Bundle> = {}): Tier2Bundle {
  const skip = { ok: false as const, error: 'skip' };
  return {
    snapshot: skip,
    bars: skip,
    fundamentals: skip,
    filings: skip,
    borrow: skip,
    news: skip,
    droppiness: skip,
    burn: skip,
    nasdaq: skip,
    regSho: skip,
    tickerChanges: skip,
    dtCash: skip,
    ...overrides,
  } as Tier2Bundle;
}

beforeEach(() => {
  (globalThis as { __dtDurable?: Map<string, unknown> }).__dtDurable?.clear();
  process.env.DILUTIONTRACKER_API_KEY = 'test-key';
  global.fetch = jest.fn();
});

afterAll(() => {
  if (ORIGINAL_KEY == null) delete process.env.DILUTIONTRACKER_API_KEY;
  else process.env.DILUTIONTRACKER_API_KEY = ORIGINAL_KEY;
});

describe('DilutionTracker cash position', () => {
  it('returns unavailable without calling the API when no key is set', async () => {
    delete process.env.DILUTIONTRACKER_API_KEY;
    const result = await fetchDtCashPosition('CGIX');
    expect(result).toEqual({ status: 'unavailable', reason: 'no_key' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('parses runway and cash and sends the key in the x-api-key header', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(200, {
        ticker: 'CGIX',
        hasEstCurrentCash: true,
        monthsCashRunway: 3.5,
        estCurrentCash: 12.5,
        lastReportedCashDate: '2026-09-30',
        timeSeriesData: [],
      })
    );
    const result = await fetchDtCashPosition('cgix');
    expect(result).toEqual({
      status: 'ok',
      data: { runwayMonths: 3.5, cashMillions: 12.5, lastReportedCashDate: '2026-09-30' },
    });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.dilutiontracker.com/v2/cash-position/CGIX');
    expect((init as RequestInit).headers).toMatchObject({ 'x-api-key': 'test-key' });
  });

  it('caches successful results so a repeat call does not spend another request', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, { hasEstCurrentCash: true, monthsCashRunway: 100 })
    );
    await fetchDtCashPosition('CGIX');
    await fetchDtCashPosition('CGIX');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('maps 400 and empty payloads to not_found', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(problem(400, 'x/no-profile'));
    expect(await fetchDtCashPosition('AAA')).toEqual({ status: 'not_found' });

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, { hasEstCurrentCash: false }));
    expect(await fetchDtCashPosition('BBB')).toEqual({ status: 'not_found' });
  });

  it('distinguishes monthly quota from per-minute rate limits and does not cache either', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(problem(429, 'https://api.dilutiontracker.com/errors/quota-exceeded'))
      .mockResolvedValueOnce(problem(429, 'https://api.dilutiontracker.com/errors/rate-limit-exceeded'))
      .mockResolvedValueOnce(problem(502, 'https://api.dilutiontracker.com/errors/bad-gateway'));

    expect(await fetchDtCashPosition('CGIX')).toEqual({ status: 'unavailable', reason: 'quota' });
    expect(await fetchDtCashPosition('CGIX')).toEqual({ status: 'unavailable', reason: 'rate_limited' });
    expect(await fetchDtCashPosition('CGIX')).toEqual({ status: 'unavailable', reason: 'upstream' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('treats a 403 as the plan not including the endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(403, undefined));
    expect(await fetchDtCashPosition('CGIX')).toEqual({ status: 'unavailable', reason: 'plan' });
  });

  it('parseCashPosition returns null when neither runway nor cash is present', () => {
    expect(parseCashPosition({ hasEstCurrentCash: false })).toBeNull();
  });

  it('toRunwayContext carries the not_found and unavailable states through', () => {
    expect(toRunwayContext({ status: 'not_found' })).toEqual({ status: 'not_found' });
    expect(toRunwayContext({ status: 'unavailable', reason: 'quota' })).toEqual({
      status: 'unavailable',
      reason: 'quota',
    });
  });
});

describe('DilutionTracker reverse splits', () => {
  it('keeps reverse splits and drops forward splits', () => {
    const parsed = parseReverseSplits([
      { status: 'completed', splitRatio: 10, effectiveDate: '2025-03-31T00:00:00.000Z' },
      { status: 'upcoming', splitRatio: 0.5, effectiveDate: '2026-12-01T00:00:00.000Z' },
      { status: 'voteApproved', splitRatio: null, effectiveDate: '2026-12-15T00:00:00.000Z' },
    ]);
    expect(parsed).toEqual([
      { status: 'completed', date: '2025-03-31', ratio: '1-for-10' },
      { status: 'voteApproved', date: '2026-12-15', ratio: null },
    ]);
  });

  it('returns the earliest future split that is not completed', () => {
    const found = detectUpcomingReverseSplitFromDilutionTracker(
      [
        { status: 'completed', date: '2026-12-01', ratio: '1-for-5' },
        { status: 'upcoming', date: '2027-02-01', ratio: '1-for-20' },
        { status: 'upcoming', date: '2026-12-20', ratio: '1-for-10' },
      ],
      ASOF
    );
    expect(found).toMatchObject({
      effectiveDate: '2026-12-20',
      ratio: '1-for-10',
      source: 'dilutiontracker',
      certainty: 'set',
    });
  });

  it('marks a shareholder-approved split without a ratio as possible', () => {
    const found = detectUpcomingReverseSplitFromDilutionTracker(
      [{ status: 'voteApproved', date: '2026-12-15', ratio: null }],
      ASOF
    );
    expect(found).toMatchObject({ effectiveDate: '2026-12-15', source: 'dilutiontracker', certainty: 'possible' });
    expect(found?.ratio).toBeUndefined();
  });

  it('uses DilutionTracker only when EDGAR and Polygon have nothing', () => {
    const dt = [{ status: 'upcoming' as const, date: '2026-12-20', ratio: '1-for-10' }];
    const polygon = [{ date: '2026-12-05', ratio: '1-for-4' }];

    expect(mergeUpcomingReverseSplit([], polygon, ASOF, dt)).toMatchObject({ source: 'polygon' });
    expect(mergeUpcomingReverseSplit([], undefined, ASOF, dt)).toMatchObject({ source: 'dilutiontracker' });
    expect(mergeUpcomingReverseSplit([], undefined, ASOF)).toBeNull();
  });

  it('EDGAR still wins over DilutionTracker', () => {
    const edgarEvent: CapitalEvent = {
      type: 'reverse_split',
      title: 'Reverse split approved',
      description: 'Stockholders approved a 1-for-8 reverse stock split effective December 10, 2026.',
      eventDate: '2026-12-10',
      isUpcoming: true,
      isRetrospective: false,
      evidence: { excerpt: 'approved reverse stock split effective December 10, 2026', documentUrl: 'https://sec.gov/x' },
    } as unknown as CapitalEvent;
    const found = mergeUpcomingReverseSplit(
      [edgarEvent],
      undefined,
      ASOF,
      [{ status: 'upcoming', date: '2026-12-20', ratio: '1-for-10' }]
    );
    expect(found?.source).toBe('edgar');
  });

  it('fetchDtReverseSplits returns unavailable without a key', async () => {
    delete process.env.DILUTIONTRACKER_API_KEY;
    expect(await fetchDtReverseSplits('CGIX')).toEqual({ status: 'unavailable', reason: 'no_key' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('DilutionTracker runway feeds walk-aways as a fallback', () => {
  const burnOk = (runwayMonths: number | null) =>
    ({
      ok: true as const,
      value: {
        quarterlyBurn: 4e6,
        runwayMonths,
        positiveFcf: false,
        cashUsd: 30e6,
        source: 'polygon',
      },
    }) as unknown as Tier2Bundle['burn'];

  const dtOk = (runwayMonths: number | null) =>
    ({
      ok: true as const,
      value: {
        status: 'ok' as const,
        data: { runwayMonths, cashMillions: 12.5, lastReportedCashDate: '2026-09-30' },
      },
    }) as Tier2Bundle['dtCash'];

  it('keeps the Polygon/Finnhub runway when both sources have one', () => {
    const withDt = buildFastVerdict(
      'CGIX',
      skipBundle({ burn: burnOk(9), dtCash: dtOk(3) }),
      Date.now()
    );
    const withoutDt = buildFastVerdict(
      'CGIX',
      skipBundle({ burn: burnOk(9), dtCash: { ok: true, value: { status: 'unavailable', reason: 'quota' } } }),
      Date.now()
    );
    expect(withDt.fundamentals.runwayMonths).toBe(9);
    expect(withDt.verdict).toBe(withoutDt.verdict);
    expect(withDt.reason).toBe(withoutDt.reason);
    expect(withDt.flags).toEqual(withoutDt.flags);
    expect(withDt.dilutionTrackerRunway).toMatchObject({ status: 'ok', runwayMonths: 3 });
  });

  it('uses DilutionTracker runway when Polygon/Finnhub have none', () => {
    const built = buildFastVerdict('CGIX', skipBundle({ burn: burnOk(null), dtCash: dtOk(100) }), Date.now());
    expect(built.fundamentals.runwayMonths).toBe(100);
  });

  it('leaves runway null when neither source has one', () => {
    const built = buildFastVerdict(
      'CGIX',
      skipBundle({ burn: burnOk(null), dtCash: { ok: true, value: { status: 'unavailable', reason: 'no_key' } } }),
      Date.now()
    );
    expect(built.fundamentals.runwayMonths).toBeNull();
  });

  it('the W9 rule walks away at or above the runway threshold, and only then', () => {
    const base = {
      dataCompleteness: 1,
      todayMovePct: 0.5,
      newsClass: 'NONE' as const,
      fatalWithWeasel: false,
      runnerClass: 'CLEAN' as const,
      borrowAvailable: true,
      droppiness: { status: 'OK', score: 80, spikeCount: 0 } as unknown as FastVerdict['droppiness'],
      instOwn: 0.1,
      marketCap: 10e6,
      positiveFcf: false,
      floatShares: 20e6,
      derivedOfferingAbility: 'HIGH' as const,
    };
    expect(evaluateWalkAways({ ...base, runwayMonths: 100 })).toMatchObject({
      verdict: 'NO_TRADE',
      reason: 'W9:runway',
    });
    expect(evaluateWalkAways({ ...base, runwayMonths: 3 }).reason).not.toBe('W9:runway');
    expect(evaluateWalkAways({ ...base, runwayMonths: null }).reason).not.toBe('W9:runway');
  });

  it('prints the DilutionTracker runway line only when data is present', () => {
    const withDt = buildFastVerdict('CGIX', skipBundle({ dtCash: dtOk(3) }), Date.now());
    expect(formatFastVerdictText(withDt)).toContain(
      'Runway  DilutionTracker ~3.0mo runway, cash $12.5M, last report 2026-09-30'
    );

    const withoutDt = buildFastVerdict('CGIX', skipBundle(), Date.now());
    expect(formatFastVerdictText(withoutDt)).not.toContain('DilutionTracker');
  });
});

describe('DilutionTracker company profile and developments', () => {
  it('parseCompanyProfile keeps the fields the card shows', () => {
    expect(
      parseCompanyProfile({
        symbol: 'CGIX',
        companyName: 'Cognition Therapeutics',
        description: null,
        industry: 'Biotechnology',
        sector: 'Healthcare',
        exchange: 'NASDAQ',
        country: 'US',
        isDelisted: false,
        inDtCoverage: true,
      })
    ).toMatchObject({
      companyName: 'Cognition Therapeutics',
      description: null,
      sector: 'Healthcare',
      inDtCoverage: true,
      isDelisted: false,
    });
    expect(parseCompanyProfile(null as unknown as CompanyProfileBody)).toBeNull();
  });

  it('parseDevelopments sorts newest first, caps the count, and drops incomplete items', () => {
    const items = parseDevelopments(
      [
        { _id: 'a', publishedDatetime: '2026-01-01T00:00:00.000Z', bodyText: 'old', ticker: 'X' },
        { _id: 'b', publishedDatetime: '2026-03-01T00:00:00.000Z', bodyText: 'new', ticker: 'X' },
        { _id: 'c', publishedDatetime: '2026-02-01T00:00:00.000Z', bodyText: 'mid', ticker: 'X' },
        { _id: 'd', publishedDatetime: '2026-04-01T00:00:00.000Z', bodyText: '', ticker: 'X' },
      ],
      2
    );
    expect(items.map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('fetchDtCompanyProfile and fetchDtMajorDevelopments return unavailable without a key', async () => {
    delete process.env.DILUTIONTRACKER_API_KEY;
    expect(await fetchDtCompanyProfile('CGIX')).toEqual({ status: 'unavailable', reason: 'no_key' });
    expect(await fetchDtMajorDevelopments('CGIX')).toEqual({ status: 'unavailable', reason: 'no_key' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetchDtMajorDevelopments calls the endpoint once and serves the repeat from cache', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, [
        { _id: 'a', publishedDatetime: '2026-03-01T00:00:00.000Z', bodyText: 'text', ticker: 'CGIX' },
      ])
    );
    const first = await fetchDtMajorDevelopments('CGIX');
    await fetchDtMajorDevelopments('CGIX');
    expect(first.status).toBe('ok');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://api.dilutiontracker.com/v2/major-developments/CGIX'
    );
  });
});
