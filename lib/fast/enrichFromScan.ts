// lib/fast/enrichFromScan.ts
// Merge /api/scan payload into a FastVerdict on the Fast Scan page.

import { T } from '@/lib/config/thresholds';
import { toFastDroppiness } from '@/lib/droppiness/map';
import { computeBabyShelf } from '@/lib/fast/babyShelf';
import { evaluateWalkAways } from '@/lib/fast/walkAway';
import { normalizeShareCount } from '@/lib/normalizeShares';
import type { FastVerdict } from '@/lib/fast/types';

const FAST_SOURCE_COUNT = 6;

type ScanPayload = {
  droppinessScore?: number;
  droppinessSpikeCount?: number;
  droppinessDetail?: unknown[];
  floatShares?: number;
  marketCap?: number;
  institutionalOwnership?: number;
  shortFloat?: number;
  capitalPressure?: {
    fundamentals?: {
      cashUsd?: number;
      operatingCashFlowUsd?: number;
    };
  };
};

function burnFromScan(scan: ScanPayload): {
  quarterlyBurn: number | null;
  runwayMonths: number | null;
  positiveFcf: boolean;
} {
  const cash = scan.capitalPressure?.fundamentals?.cashUsd;
  const ocf = scan.capitalPressure?.fundamentals?.operatingCashFlowUsd;
  if (ocf == null) {
    return { quarterlyBurn: null, runwayMonths: null, positiveFcf: false };
  }
  if (ocf >= 0) {
    return { quarterlyBurn: null, runwayMonths: null, positiveFcf: true };
  }
  const quarterlyBurn = Math.abs(ocf);
  const runwayMonths =
    cash != null && quarterlyBurn > 0 ? cash / (quarterlyBurn / 3) : null;
  return { quarterlyBurn, runwayMonths, positiveFcf: false };
}

function recomputeWalkAway(verdict: FastVerdict): Pick<FastVerdict, 'verdict' | 'reason' | 'flags'> {
  const fatalWithWeasel =
    verdict.news.matchedTerms.fatal.length > 0 &&
    verdict.news.matchedTerms.weasel.length > 0;
  const walk = evaluateWalkAways({
    dataCompleteness: verdict.dataCompleteness,
    todayMovePct: verdict.price.todayMovePct,
    newsClass: verdict.news.class,
    fatalWithWeasel,
    runnerClass: verdict.runner.class,
    borrowAvailable: verdict.borrow.available,
    droppiness: verdict.droppiness,
    instOwn: verdict.fundamentals.instOwn,
    marketCap: verdict.fundamentals.marketCap,
    runwayMonths: verdict.fundamentals.runwayMonths,
    positiveFcf: false,
    floatShares: verdict.fundamentals.float,
    derivedOfferingAbility: verdict.dilution.derivedOfferingAbility,
  });
  const flags = [...walk.flags];
  if (verdict.news.tickerRecycleWarning) {
    flags.push('tickerRecycleWarning — old news may be from prior ticker occupant');
  }
  return { verdict: walk.verdict, reason: walk.reason, flags };
}

/** Prefer live scan facts (droppiness, SEC burn, float) over standalone /api/fast. */
export function enrichFastVerdictFromScan(
  verdict: FastVerdict,
  scan: ScanPayload | null | undefined
): FastVerdict {
  if (!scan) return verdict;

  let next: FastVerdict = { ...verdict };

  const score = scan.droppinessScore;
  if (typeof score === 'number' && Number.isFinite(score)) {
    const spikeCount =
      scan.droppinessSpikeCount ??
      (Array.isArray(scan.droppinessDetail) ? scan.droppinessDetail.length : null);

    const cached = {
      score,
      spikeCount: spikeCount ?? 0,
      nEff: spikeCount ?? 0,
      computedAt: new Date().toISOString(),
      method: 'bayesian_8h' as const,
    };
    const mapped = toFastDroppiness(cached);
    next = {
      ...next,
      droppiness:
        spikeCount == null || spikeCount >= T.droppiness.minSpikes
          ? {
              status: 'OK',
              score,
              spikeCount,
              computedAt: cached.computedAt,
            }
          : mapped,
      flags: next.flags.filter((f) => !/droppiness\s+UNVERIFIED/i.test(f)),
    };
  }

  const floatShares =
    normalizeShareCount(scan.floatShares) ?? next.fundamentals.float ?? null;
  const burn = burnFromScan(scan);
  const price = next.price.last;
  const dilution = computeBabyShelf({
    floatShares,
    price,
    quarterlyBurn: burn.quarterlyBurn,
    atmDetected: next.dilution.atmDetected,
    hasEffectiveShelf: next.dilution.hasEffectiveShelf,
  });

  const fundamentalsPatched =
    floatShares != null ||
    scan.marketCap != null ||
    scan.institutionalOwnership != null ||
    burn.runwayMonths != null;

  if (fundamentalsPatched || burn.quarterlyBurn != null) {
    next = {
      ...next,
      fundamentals: {
        ...next.fundamentals,
        float: floatShares ?? next.fundamentals.float,
        marketCap: scan.marketCap ?? next.fundamentals.marketCap,
        instOwn:
          scan.institutionalOwnership != null
            ? scan.institutionalOwnership / 100
            : next.fundamentals.instOwn,
        shortInterest:
          scan.shortFloat != null ? scan.shortFloat / 100 : next.fundamentals.shortInterest,
        runwayMonths: burn.runwayMonths ?? next.fundamentals.runwayMonths,
      },
      dilution: {
        ...next.dilution,
        ...dilution,
        derivedOfferingAbility: dilution.derivedOfferingAbility,
      },
    };

    const unavailable = next.unavailable.filter((u) => u !== 'fundamentals');
    if (unavailable.length !== next.unavailable.length) {
      next = {
        ...next,
        unavailable,
        dataCompleteness:
          Math.round(((FAST_SOURCE_COUNT - unavailable.length) / FAST_SOURCE_COUNT) * 1000) /
          1000,
      };
    }

    next = { ...next, ...recomputeWalkAway(next) };
  }

  return next;
}
