import type { CapitalPressureResult } from '@/lib/capitalPressure/types';
import type { QuickScorecardCapitalPressureSlice } from './types';

type CapitalPressureLike = {
  available?: boolean;
  score?: number;
  status?: string;
  summary?: string;
  dilutionLikelihood?: number;
  shortExecutionRisk?: number;
  recentIssuance?: {
    shares30d?: number;
    shares90d?: number;
    status?: string;
  };
  events?: Array<{
    type: string;
    eventDate?: string;
    isRetrospective?: boolean;
  }>;
  upcomingReverseSplit?: {
    effectiveDate?: string;
    ratio?: string;
    summary?: string;
  } | null;
  reasons?: Array<{ label: string; points: number }>;
};

export function mapCapitalPressureSlice(
  cp: CapitalPressureLike | CapitalPressureResult | null | undefined
): QuickScorecardCapitalPressureSlice | null {
  if (!cp) return null;

  return {
    available: cp.available,
    score: cp.score,
    status: cp.status,
    dilutionLikelihood: cp.dilutionLikelihood,
    shortExecutionRisk: cp.shortExecutionRisk,
    recentIssuance: cp.recentIssuance
      ? {
          shares30d: cp.recentIssuance.shares30d,
          shares90d: cp.recentIssuance.shares90d,
          status: cp.recentIssuance.status,
        }
      : undefined,
    events: cp.events?.map((event) => ({
      type: event.type,
      eventDate: event.eventDate,
      isRetrospective: event.isRetrospective,
    })),
    upcomingReverseSplit: cp.upcomingReverseSplit
      ? {
          effectiveDate: cp.upcomingReverseSplit.effectiveDate,
          ratio: cp.upcomingReverseSplit.ratio,
          summary:
            'summary' in cp.upcomingReverseSplit
              ? cp.upcomingReverseSplit.summary
              : undefined,
        }
      : cp.upcomingReverseSplit === null
        ? null
        : undefined,
    reasons: cp.reasons?.map((reason) => ({
      label: reason.label,
      points: reason.points,
    })),
  };
}
