// FINRA TRF daily short-sale volume. Pure shaping only — no network.
// This overlay does not change the Short Check score or a fast walk-away.

import { T } from '@/lib/config/thresholds';
import { normalizeShareCount } from '@/lib/normalizeShares';
import type { FastVerdict } from './types';

export const REG_SHO_SHORT_VOLUME_SOURCE =
  'https://www.finra.org/finra-data/browse-catalog/equity-short-sale-volume-data/daily-short-sale-volume-files';

/** FINRA posts the daily file on weekday mornings. Cache at least this long so a fetch just before 8:00 AM ET is not discarded minutes later. */
const MIN_SHORT_VOLUME_CACHE_MS = 6 * 60 * 60 * 1000;
const PUBLICATION_HOUR_ET = 8;

type EtClock = {
  year: number;
  month: number;
  day: number;
  weekday: string;
};

function etClock(ms: number): EtClock {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))) {
    bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    weekday: bag.weekday,
  };
}

/** UTC instant for an America/New_York wall time. */
function etWallToUtc(year: number, month: number, day: number, hour: number): number {
  let guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let i = 0; i < 4; i++) {
    const wall = etClock(guess);
    const hourBag: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess))) {
      hourBag[part.type] = part.value;
    }
    const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, Number(hourBag.hour), Number(hourBag.minute), 0);
    const target = Date.UTC(year, month - 1, day, hour, 0, 0);
    const delta = target - asUtc;
    if (delta === 0) return guess;
    guess += delta;
  }
  return guess;
}

function addCalendarDays(year: number, month: number, day: number, days: number) {
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

/** When this ticker's short-volume payload should be fetched again: the next weekday 8:00 AM ET, at least 6 hours away. */
export function regShoShortVolumeCacheUntil(now = Date.now()): number {
  const start = etClock(now);
  let cursor = { year: start.year, month: start.month, day: start.day };
  for (let i = 0; i < 10; i++) {
    const target = etWallToUtc(cursor.year, cursor.month, cursor.day, PUBLICATION_HOUR_ET);
    const weekday = etClock(target).weekday;
    if (target - now >= MIN_SHORT_VOLUME_CACHE_MS && weekday !== 'Sat' && weekday !== 'Sun') {
      return target;
    }
    cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
  }
  return now + 24 * 60 * 60 * 1000;
}

export function regShoShortVolumeCacheSeconds(now = Date.now()): number {
  return Math.max(1, Math.round((regShoShortVolumeCacheUntil(now) - now) / 1000));
}

export type RegShoShortVolumeStatus = 'ok' | 'empty' | 'unavailable';

export type RegShoFacilityPrint = {
  code: string;
  marketCode: string;
  shortShares: number;
  shortExemptShares: number;
  totalShares: number;
};

export type RegShoShortDay = {
  tradeDate: string;
  shortShares: number;
  shortExemptShares: number;
  totalShares: number;
  shortRatio: number | null;
  consolidatedVolume: number | null;
  trfShareOfTape: number | null;
  facilities: RegShoFacilityPrint[];
};

export type RegShoShortVolumePayload = {
  ticker: string;
  status: RegShoShortVolumeStatus;
  sourceUrl: string;
  days: RegShoShortDay[];
};

export type RegShoShortVolumeReport = RegShoShortVolumePayload & {
  recentDays: RegShoShortDay[];
  latest: RegShoShortDay | null;
  priorMedianShortShares: number | null;
  vsMedian: number | null;
  floatShares: number | null;
  floatMultiple: number | null;
  exemptRatio: number | null;
  regime: boolean;
  line: string | null;
  flag: string | null;
  sentence: string | null;
};

export type FinraRegShoDailyRow = {
  reportingFacilityCode?: string;
  marketCode?: string;
  tradeReportDate?: string;
  shortParQuantity?: number;
  shortExemptParQuantity?: number;
  totalParQuantity?: number;
  securitiesInformationProcessorSymbolIdentifier?: string;
};

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function formatShareCount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions >= 100 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  return Math.round(value).toLocaleString('en-US');
}

export function formatMultiple(value: number): string {
  if (value >= 100) return `${Math.round(value).toLocaleString('en-US')}×`;
  if (value >= 10) return `${value.toFixed(0)}×`;
  return `${value.toFixed(1)}×`;
}

export function aggregateFacilityRows(rows: FinraRegShoDailyRow[]): RegShoShortDay[] {
  const byDate = new Map<string, RegShoShortDay>();
  for (const row of rows) {
    const tradeDate = row.tradeReportDate?.trim();
    if (!tradeDate) continue;
    let day = byDate.get(tradeDate);
    if (!day) {
      day = {
        tradeDate,
        shortShares: 0,
        shortExemptShares: 0,
        totalShares: 0,
        shortRatio: null,
        consolidatedVolume: null,
        trfShareOfTape: null,
        facilities: [],
      };
      byDate.set(tradeDate, day);
    }
    const shortShares = num(row.shortParQuantity);
    const shortExemptShares = num(row.shortExemptParQuantity);
    const totalShares = num(row.totalParQuantity);
    day.shortShares += shortShares;
    day.shortExemptShares += shortExemptShares;
    day.totalShares += totalShares;
    day.facilities.push({
      code: row.reportingFacilityCode?.trim() || 'UNKNOWN',
      marketCode: row.marketCode?.trim() || '',
      shortShares,
      shortExemptShares,
      totalShares,
    });
  }

  const days = [...byDate.values()].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  for (const day of days) {
    day.shortRatio = day.totalShares > 0 ? day.shortShares / day.totalShares : null;
  }
  return days;
}

export function applyConsolidatedVolume(
  days: RegShoShortDay[],
  volumeByDate: Map<string, number> | Record<string, number>
): RegShoShortDay[] {
  const lookup = (date: string): number | null => {
    const value = volumeByDate instanceof Map ? volumeByDate.get(date) : volumeByDate[date];
    return typeof value === 'number' && value > 0 ? value : null;
  };
  return days.map((day) => {
    const consolidatedVolume = lookup(day.tradeDate);
    if (consolidatedVolume == null) return day;
    const share = day.totalShares / consolidatedVolume;
    return {
      ...day,
      consolidatedVolume,
      trfShareOfTape: share <= 1.25 ? share : null,
    };
  });
}

export function resolveFloatShares(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    const normalized = normalizeShareCount(value);
    if (normalized != null && normalized > 0) return normalized;
  }
  return null;
}

function formatLine(report: {
  latest: RegShoShortDay | null;
  vsMedian: number | null;
  floatMultiple: number | null;
  exemptRatio: number | null;
}): string | null {
  const latest = report.latest;
  if (!latest) return null;
  const parts = [`${formatShareCount(latest.shortShares)} TRF`];
  if (report.floatMultiple != null) parts.push(`${formatMultiple(report.floatMultiple)} float`);
  if (report.vsMedian != null) {
    parts.push(`${formatMultiple(report.vsMedian)} its ${T.regShoShortVolume.medianSessions}-day median`);
  }
  if (report.exemptRatio != null && report.exemptRatio > 0) {
    parts.push(`exempt ${Math.round(report.exemptRatio * 100)}%`);
  }
  if (latest.trfShareOfTape != null) {
    parts.push(`TRF is ${Math.round(latest.trfShareOfTape * 100)}% of the tape`);
  }
  return parts.join(' · ');
}

export function shortVolumePromptSentence(report: RegShoShortVolumeReport): string | null {
  if (report.status !== 'ok' || !report.latest) return null;
  const latest = report.latest;
  const ratio =
    latest.shortRatio != null
      ? `${(latest.shortRatio * 100).toFixed(1)}% of TRF volume`
      : 'TRF volume ratio unavailable';
  const exempt =
    report.exemptRatio != null && report.exemptRatio > 0
      ? `, exempt ${Math.round(report.exemptRatio * 100)}% of the short print`
      : '';
  const medianBit =
    report.vsMedian != null && report.priorMedianShortShares != null
      ? ` That is ${formatMultiple(report.vsMedian)} the prior ${T.regShoShortVolume.medianSessions}-session median of ${formatShareCount(report.priorMedianShortShares)}.`
      : '';
  const floatBit =
    report.floatMultiple != null ? ` Short volume is ${formatMultiple(report.floatMultiple)} float.` : '';
  const crowd = report.regime
    ? ' The print is large versus both float and the recent median, so published short interest may be stale and the name may already be crowded.'
    : ' A high short percentage on a small print is ordinary; the level versus float and the recent median is the signal.';
  return `FINRA TRF short volume on ${latest.tradeDate} was ${formatShareCount(latest.shortShares)} shares (${ratio}${exempt}).${medianBit}${floatBit}${crowd} This is daily short-sale volume, not bi-monthly short interest and not the Reg SHO threshold list. It does not change the Short Check score.`;
}

export function buildRegShoShortVolumeReport(
  payload: RegShoShortVolumePayload,
  options?: { floatShares?: number | null }
): RegShoShortVolumeReport {
  const days = [...payload.days].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const latest = payload.status === 'ok' && days.length > 0 ? days[days.length - 1] : null;
  const prior = latest ? days.slice(0, -1).slice(-T.regShoShortVolume.medianSessions) : [];
  const priorMedianShortShares = median(prior.map((day) => day.shortShares));
  const vsMedian =
    latest && priorMedianShortShares != null && priorMedianShortShares > 0
      ? latest.shortShares / priorMedianShortShares
      : null;
  const floatShares = resolveFloatShares(options?.floatShares);
  const floatMultiple =
    latest && floatShares != null ? latest.shortShares / floatShares : null;
  const exemptRatio =
    latest && latest.shortShares > 0 ? latest.shortExemptShares / latest.shortShares : null;
  const regime =
    latest != null &&
    prior.length >= T.regShoShortVolume.minPriorSessions &&
    vsMedian != null &&
    vsMedian >= T.regShoShortVolume.regimeMedianMultiple &&
    floatMultiple != null &&
    floatMultiple >= T.regShoShortVolume.regimeFloatMultiple;

  const recentDays = days.slice(-T.regShoShortVolume.recentDays);
  const draft: RegShoShortVolumeReport = {
    ticker: payload.ticker,
    status: payload.status === 'ok' && days.length === 0 ? 'empty' : payload.status,
    sourceUrl: payload.sourceUrl || REG_SHO_SHORT_VOLUME_SOURCE,
    days,
    recentDays,
    latest,
    priorMedianShortShares,
    vsMedian,
    floatShares,
    floatMultiple,
    exemptRatio,
    regime,
    line: null,
    flag: null,
    sentence: null,
  };
  draft.line = draft.status === 'ok' ? formatLine(draft) : null;
  draft.flag = regime && draft.priorMedianShortShares != null && latest
    ? `TRF short-volume regime — ${formatShareCount(latest.shortShares)} vs ${T.regShoShortVolume.medianSessions}-day median ${formatShareCount(draft.priorMedianShortShares)}`
    : null;
  draft.sentence = shortVolumePromptSentence(draft);
  return draft;
}

export function appendShortVolumeFlag(flags: string[], report: RegShoShortVolumeReport | null | undefined): string[] {
  const flag = report?.flag;
  if (!flag) return flags;
  if (flags.some((item) => item.startsWith('TRF short-volume regime'))) return flags;
  return [...flags, flag];
}

export function attachRegShoShortVolume(
  verdict: FastVerdict | null,
  report: RegShoShortVolumeReport | null | undefined
): FastVerdict | null {
  if (!verdict || !report) return verdict;
  return {
    ...verdict,
    shortVolume: report,
    flags: appendShortVolumeFlag(verdict.flags, report),
  };
}
