// lib/fast/walkAway.ts
import { T } from '@/lib/config/thresholds';
import type { FastVerdict, FastVerdictKind, NewsClass, OfferingAbility, RunnerClass } from './types';

export type WalkAwayInput = {
  dataCompleteness: number;
  todayMovePct: number | null;
  newsClass: NewsClass;
  fatalWithWeasel: boolean;
  runnerClass: RunnerClass;
  borrowAvailable: boolean | null;
  droppiness: FastVerdict['droppiness'];
  instOwn: number | null; // fraction 0–1
  marketCap: number | null;
  runwayMonths: number | null;
  positiveFcf: boolean;
  floatShares: number | null;
  derivedOfferingAbility: OfferingAbility;
};

export function evaluateWalkAways(input: WalkAwayInput): {
  verdict: FastVerdictKind;
  reason: string | null;
  flags: string[];
} {
  const flags: string[] = [];

  // Soft flags first
  if (input.droppiness.status === 'UNVERIFIED') {
    flags.push('droppiness UNVERIFIED');
  }
  if (input.fatalWithWeasel) {
    flags.push('headline has FATAL + WEASEL terms — likely fluff, review carefully');
  }
  if (input.newsClass === 'IDEAL') {
    flags.push('ideal catalyst keywords matched');
  }
  if (input.newsClass === 'NONE' && input.todayMovePct != null && input.todayMovePct >= T.todayMove.min) {
    flags.push('unexplained move — no news');
  }
  if (
    input.floatShares != null &&
    input.floatShares < T.float.squeezeFloor &&
    input.derivedOfferingAbility === 'LOW'
  ) {
    flags.push(`thin float ${(input.floatShares / 1e6).toFixed(2)}M w/ LOW offering ability — squeeze geometry`);
  }

  // W1
  if (input.dataCompleteness < T.dataQuality.minCompleteness) {
    return { verdict: 'WATCH', reason: 'W1:dataCompleteness', flags };
  }

  // W2 — discretionary pump-day filter (soft flag; does not hard-disqualify)
  if (input.todayMovePct == null || input.todayMovePct < T.todayMove.min) {
    const moveLabel =
      input.todayMovePct == null
        ? 'unknown'
        : `${(input.todayMovePct * 100).toFixed(0)}%`;
    flags.push(
      `W2:todayMove — ${moveLabel} today (discretionary ${Math.round(T.todayMove.min * 100)}%+ pump-day threshold)`
    );
  }

  // W3 — real catalyst (addendum)
  if (input.newsClass === 'FATAL') {
    return { verdict: 'NO_TRADE', reason: 'W3:fatalNews', flags };
  }

  // W4 — runner (renumbered after addendum insert; keep reason ids stable to rules)
  if (input.runnerClass === 'RUNNER_YESTERDAY' || input.runnerClass === 'RUNNER_MULTIDAY') {
    return { verdict: 'NO_TRADE', reason: `W4:${input.runnerClass}`, flags };
  }

  // W5 borrow
  if (T.borrow.requireAvailable && input.borrowAvailable === false) {
    return { verdict: 'NO_TRADE', reason: 'W5:borrowUnavailable', flags };
  }

  // W6 droppiness
  if (
    input.droppiness.status === 'OK' &&
    input.droppiness.score != null &&
    input.droppiness.spikeCount != null &&
    input.droppiness.score < T.droppiness.walkAway &&
    input.droppiness.spikeCount >= T.droppiness.minSpikes
  ) {
    return { verdict: 'NO_TRADE', reason: 'W6:droppiness', flags };
  }

  // W7 inst own
  if (input.instOwn != null && input.instOwn >= T.instOwn.walkAway) {
    return { verdict: 'NO_TRADE', reason: 'W7:instOwn', flags };
  }

  // W8 market cap
  if (input.marketCap != null && input.marketCap > T.marketCap.max) {
    return { verdict: 'NO_TRADE', reason: 'W8:marketCap', flags };
  }

  // W9 runway / FCF
  if (input.positiveFcf || (input.runwayMonths != null && input.runwayMonths >= T.runway.walkAway)) {
    return { verdict: 'NO_TRADE', reason: 'W9:runway', flags };
  }

  // W10 squeeze geometry (addendum W9 rewrite)
  if (
    input.floatShares != null &&
    input.floatShares < T.float.squeezeFloor &&
    input.derivedOfferingAbility !== 'HIGH'
  ) {
    return { verdict: 'NO_TRADE', reason: 'W10:squeezeGeometry', flags };
  }

  return { verdict: 'REVIEW', reason: null, flags };
}
