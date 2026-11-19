import {
  aggregateFacilityRows,
  appendShortVolumeFlag,
  applyConsolidatedVolume,
  attachRegShoShortVolume,
  buildRegShoShortVolumeReport,
  regShoShortVolumeCacheUntil,
} from '../lib/fast/regShoShortVolume';
import type { FastVerdict } from '../lib/fast/types';

const akanRows = [
  { tradeReportDate: '2026-11-12', reportingFacilityCode: 'NQTRF', marketCode: 'Q', shortParQuantity: 11161, shortExemptParQuantity: 0, totalParQuantity: 21437 },
  { tradeReportDate: '2026-11-12', reportingFacilityCode: 'NYTRF', marketCode: 'N', shortParQuantity: 1283, shortExemptParQuantity: 0, totalParQuantity: 2035 },
  { tradeReportDate: '2026-11-13', reportingFacilityCode: 'NQTRF', marketCode: 'Q', shortParQuantity: 24_342_636, shortExemptParQuantity: 5_437_264, totalParQuantity: 42_441_773 },
  { tradeReportDate: '2026-11-13', reportingFacilityCode: 'NYTRF', marketCode: 'N', shortParQuantity: 3_495_714, shortExemptParQuantity: 1535, totalParQuantity: 6_466_634 },
  { tradeReportDate: '2026-11-13', reportingFacilityCode: 'NCTRF', marketCode: 'B', shortParQuantity: 114_645, shortExemptParQuantity: 69_325, totalParQuantity: 187_522 },
];

function quietDays(count: number, shortShares: number) {
  return Array.from({ length: count }, (_, i) => ({
    tradeDate: `2026-11-${String(i + 1).padStart(2, '0')}`,
    shortShares,
    shortExemptShares: 0,
    totalShares: shortShares * 2,
    shortRatio: 0.5,
    consolidatedVolume: null,
    trfShareOfTape: null,
    facilities: [],
  }));
}

describe('FINRA daily short volume', () => {
  it('combines facility rows for one trade date', () => {
    const days = aggregateFacilityRows(akanRows);
    const nov13 = days.find((day) => day.tradeDate === '2026-11-13');
    expect(nov13?.shortShares).toBe(27_952_995);
    expect(nov13?.shortExemptShares).toBe(5_508_124);
    expect(nov13?.totalShares).toBe(49_095_929);
    expect(nov13?.facilities).toHaveLength(3);
    expect(nov13?.shortRatio).toBeCloseTo(27_952_995 / 49_095_929, 5);
  });

  it('raises a regime flag only when the print is large versus float and the median', () => {
    const prior = quietDays(8, 15_000);
    const latest = {
      ...prior[0],
      tradeDate: '2026-11-18',
      shortShares: 43_000_000,
      shortExemptShares: 14_000_000,
      totalShares: 64_000_000,
      shortRatio: 43_000_000 / 64_000_000,
    };
    const report = buildRegShoShortVolumeReport(
      { ticker: 'AKAN', status: 'ok', sourceUrl: 'https://example.test', days: [...prior, latest] },
      { floatShares: 2_000_000 }
    );
    expect(report.regime).toBe(true);
    expect(report.flag).toMatch(/^TRF short-volume regime/);
    expect(report.line).toContain('43.0M TRF');
    expect(report.line).toContain('float');
    expect(report.sentence).toContain('does not change the Short Check score');
  });

  it('keeps a high short percentage on a small print from becoming a flag', () => {
    const days = quietDays(8, 12_000).map((day, i) => ({
      ...day,
      shortRatio: i === 7 ? 0.7 : 0.2,
      shortShares: i === 7 ? 20_000 : 12_000,
      totalShares: i === 7 ? 28_571 : 60_000,
    }));
    const report = buildRegShoShortVolumeReport(
      { ticker: 'AKAN', status: 'ok', sourceUrl: 'https://example.test', days },
      { floatShares: 20_000_000 }
    );
    expect(report.latest?.shortRatio).toBeGreaterThan(0.6);
    expect(report.regime).toBe(false);
    expect(report.flag).toBeNull();
  });

  it('does not flag a median spike when float is unknown', () => {
    const prior = quietDays(8, 15_000);
    const latest = { ...prior[0], tradeDate: '2026-11-18', shortShares: 43_000_000, totalShares: 64_000_000 };
    const report = buildRegShoShortVolumeReport({
      ticker: 'AKAN',
      status: 'ok',
      sourceUrl: 'https://example.test',
      days: [...prior, latest],
    });
    expect(report.vsMedian).toBeGreaterThan(10);
    expect(report.regime).toBe(false);
    expect(report.line).not.toContain('float');
  });

  it('adds the tape share when consolidated volume is plausible', () => {
    const [day] = applyConsolidatedVolume(
      aggregateFacilityRows(akanRows).filter((item) => item.tradeDate === '2026-11-12'),
      { '2026-11-12': 100_000 }
    );
    expect(day.trfShareOfTape).toBeCloseTo(23472 / 100_000, 4);
    const over = applyConsolidatedVolume(
      [{ ...day, totalShares: 200_000, trfShareOfTape: null, consolidatedVolume: null }],
      { '2026-11-12': 100_000 }
    );
    expect(over[0].trfShareOfTape).toBeNull();
  });

  it('attaches the overlay without changing the verdict', () => {
    const prior = quietDays(8, 15_000);
    const latest = { ...prior[0], tradeDate: '2026-11-18', shortShares: 43_000_000, totalShares: 64_000_000 };
    const report = buildRegShoShortVolumeReport(
      { ticker: 'AKAN', status: 'ok', sourceUrl: 'https://example.test', days: [...prior, latest] },
      { floatShares: 2_000_000 }
    );
    const verdict = {
      ticker: 'AKAN',
      verdict: 'REVIEW',
      reason: null,
      flags: ['existing'],
    } as FastVerdict;
    const attached = attachRegShoShortVolume(verdict, report);
    expect(attached?.verdict).toBe('REVIEW');
    expect(attached?.reason).toBeNull();
    expect(attached?.flags[0]).toBe('existing');
    expect(attached?.flags.some((flag) => flag.startsWith('TRF short-volume regime'))).toBe(true);
    expect(appendShortVolumeFlag(attached?.flags ?? [], report)).toHaveLength(2);
  });

  it('caches a ticker until the next weekday 8:00 AM ET', () => {
    const wednesdayEvening = Date.parse('2026-11-19T00:00:00.000Z');
    expect(new Date(regShoShortVolumeCacheUntil(wednesdayEvening)).toISOString()).toBe(
      '2026-11-19T13:00:00.000Z'
    );

    const fridayEvening = Date.parse('2026-11-20T22:00:00.000Z');
    expect(new Date(regShoShortVolumeCacheUntil(fridayEvening)).toISOString()).toBe(
      '2026-11-23T13:00:00.000Z'
    );

    const justBeforePublication = Date.parse('2026-11-17T12:30:00.000Z');
    expect(new Date(regShoShortVolumeCacheUntil(justBeforePublication)).toISOString()).toBe(
      '2026-11-18T13:00:00.000Z'
    );
  });
});
