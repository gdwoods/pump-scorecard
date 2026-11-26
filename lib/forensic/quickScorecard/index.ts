import type { FastVerdict } from '@/lib/fast/types';
import type { CapitalPressureResult } from '@/lib/capitalPressure/types';
import type { ThesisPromptInput } from '@/lib/ai/types';
import { formatNasdaqDeficiencySummary } from '@/lib/fast/fetchNasdaqDeficient';
import { buildQuickScorecard, formatQuickScorecardForPrompt } from './buildQuickScorecard';
import { mapCapitalPressureSlice } from './mapCapitalPressureSlice';
import type { QuickScorecard, QuickScorecardInput } from './types';

export type {
  QuickScorecard,
  QuickScorecardInput,
  QuickScoreMetric,
  QuickScoreKey,
  ScoreConfidence,
} from './types';
export { buildQuickScorecard, formatQuickScorecardForPrompt };
export { mapCapitalPressureSlice };

function nasdaqListingSliceFromFast(
  listing: FastVerdict['nasdaqListing']
): NonNullable<NonNullable<QuickScorecardInput['fastVerdict']>['nasdaqListing']> | undefined {
  if (!listing) return undefined;
  return {
    status: listing.status,
    summary:
      listing.status === 'noncompliant' ? formatNasdaqDeficiencySummary(listing) || null : null,
    market: listing.market ?? null,
  };
}

/** Map thesis prompt line back into a structured soft listing status. */
export function nasdaqListingSliceFromPromptLine(
  line: string | null | undefined
): NonNullable<NonNullable<QuickScorecardInput['fastVerdict']>['nasdaqListing']> | undefined {
  if (!line) return undefined;
  if (line.includes('not on Nasdaq')) return { status: 'not_listed' };
  if (/unavailable/i.test(line)) return { status: 'unavailable' };
  if (/noncompliant/i.test(line)) {
    const summary = line.includes('—')
      ? line.split('—').slice(1).join('—').trim() || null
      : null;
    return { status: 'noncompliant', summary };
  }
  return { status: 'unavailable' };
}

export function toQuickScorecardInputFromScan(
  ticker: string,
  fastVerdict: FastVerdict | null,
  scanData: {
    capitalPressure?: CapitalPressureResult;
    floatShares?: number;
    marketCap?: number;
    shortFloat?: number;
    droppinessScore?: number;
  } | null
): QuickScorecardInput {
  return {
    ticker,
    fastVerdict: fastVerdict
      ? {
          verdict: fastVerdict.verdict,
          runnerClass: fastVerdict.runner.class,
          derivedOfferingAbility: fastVerdict.dilution.derivedOfferingAbility,
          babyShelfCapacity: fastVerdict.dilution.babyShelfCapacity,
          capacityQuarters: fastVerdict.dilution.capacityQuarters,
          atmDetected: fastVerdict.dilution.atmDetected,
          borrowAvailable: fastVerdict.borrow.available,
          borrowFeePct: fastVerdict.borrow.feePct,
          priorDayPct: fastVerdict.runner.priorDayPct,
          threeDayRunPct: fastVerdict.runner.threeDayRunPct,
          dataCompleteness: fastVerdict.dataCompleteness,
          nasdaqListing: nasdaqListingSliceFromFast(fastVerdict.nasdaqListing),
        }
      : undefined,
    fundamentals: {
      float: fastVerdict?.fundamentals.float ?? scanData?.floatShares ?? null,
      marketCap: fastVerdict?.fundamentals.marketCap ?? scanData?.marketCap ?? null,
      shortInterest: fastVerdict?.fundamentals.shortInterest ?? scanData?.shortFloat ?? null,
      runwayMonths: fastVerdict?.fundamentals.runwayMonths ?? null,
      instOwn: fastVerdict?.fundamentals.instOwn ?? null,
    },
    capitalPressure: mapCapitalPressureSlice(scanData?.capitalPressure),
    droppinessScore: scanData?.droppinessScore ?? null,
  };
}

export function toQuickScorecardInputFromThesis(
  input: ThesisPromptInput,
  cashNeedPoints?: number
): QuickScorecardInput {
  const fv = input.fastVerdict;
  const resolvedCashNeedPoints = cashNeedPoints ?? input.shortCheck?.cashNeedPoints;

  return {
    ticker: input.ticker,
    now: input.now,
    fastVerdict: fv
      ? {
          verdict: fv.verdict,
          runnerClass: fv.runnerClass,
          derivedOfferingAbility: fv.derivedOfferingAbility,
          babyShelfCapacity: fv.babyShelfCapacity,
          capacityQuarters: fv.capacityQuarters,
          atmDetected: fv.atmDetected,
          borrowAvailable: fv.borrowAvailable,
          borrowFeePct: fv.borrowFeePct,
          priorDayPct: fv.priorDayPct,
          threeDayRunPct: fv.threeDayRunPct,
          dataCompleteness: fv.dataCompleteness,
          nasdaqListing: nasdaqListingSliceFromPromptLine(fv.nasdaqListing),
        }
      : undefined,
    fundamentals: {
      float: input.extractedData?.float ?? input.scan?.fundamentals?.floatShares ?? null,
      marketCap: input.scan?.fundamentals?.marketCap ?? null,
      shortInterest: input.scan?.fundamentals?.shortFloat ?? null,
      runwayMonths: fv?.runwayMonths ?? null,
      instOwn: input.scan?.fundamentals?.institutionalOwnership ?? null,
    },
    capitalPressure: mapCapitalPressureSlice(input.scan?.capitalPressure),
    shortCheck: input.shortCheck
      ? {
          rating: input.shortCheck.rating,
          cashNeedPoints: resolvedCashNeedPoints,
        }
      : resolvedCashNeedPoints != null
        ? { cashNeedPoints: resolvedCashNeedPoints }
        : undefined,
    droppinessScore: input.scan?.droppinessScore ?? null,
  };
}

export function buildQuickScorecardFromThesis(
  input: ThesisPromptInput,
  cashNeedPoints?: number
): QuickScorecard {
  return buildQuickScorecard(toQuickScorecardInputFromThesis(input, cashNeedPoints));
}
