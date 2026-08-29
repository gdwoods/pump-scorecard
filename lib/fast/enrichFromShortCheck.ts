// lib/fast/enrichFromShortCheck.ts
// Merge page-local Short Check / scan data into a FastVerdict for display.
// Edge-safe — no KV / Node clients.

import { T } from '@/lib/config/thresholds';
import { toFastDroppiness } from '@/lib/droppiness/map';
import { evaluateWalkAways } from '@/lib/fast/walkAway';
import { normalizeShareCount } from '@/lib/normalizeShares';
import type { ExtractedData } from '@/lib/shortCheckTypes';
import type { FastVerdict, OfferingAbility } from '@/lib/fast/types';

const FAST_SOURCE_COUNT = 6;

function hasEnrichedFundamentals(f: FastVerdict['fundamentals']): boolean {
  return (
    f.float != null ||
    f.marketCap != null ||
    f.instOwn != null ||
    f.shortInterest != null ||
    f.runwayMonths != null
  );
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

export type ScanDroppinessInput = {
  score?: number;
  detail?: Array<unknown>;
  spikeCount?: number;
};

function dtTagToAbility(raw: string | undefined): OfferingAbility | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();

  if (s.startsWith('dt:')) {
    const tag = s.slice(3).trim();
    if (tag.includes('high') || tag.includes('red')) return 'HIGH';
    if (tag.includes('medium') || tag.includes('yellow')) return 'MEDIUM';
    if (tag.includes('low') || tag.includes('green')) return 'LOW';
  }

  if (/\b(atm|s-1|s-3|active)\b/.test(s)) return 'HIGH';
  if (/\b(medium|yellow)\b/.test(s)) return 'MEDIUM';
  if (/\b(low|none|green)\b/.test(s)) return 'LOW';
  if (/\b(high|red)\b/.test(s)) return 'HIGH';
  return null;
}

/** Map DT / OCR offering fields → Framework offering ability. */
export function offeringAbilityFromExtracted(
  data: ExtractedData | null | undefined
): OfferingAbility | null {
  if (!data) return null;
  // Prefer Offering Ability (ATM/Shelf) tag — not overall risk
  return dtTagToAbility(data.atmShelfStatus);
}

/**
 * Prefer live scan / DT screenshot facts over the standalone /api/fast payload
 * when both are on the same Short Check page.
 */
export function enrichFastVerdictFromShortCheck(
  verdict: FastVerdict,
  opts: {
    scanDroppiness?: ScanDroppinessInput | null;
    extracted?: ExtractedData | null;
  }
): FastVerdict {
  let next: FastVerdict = { ...verdict };

  const score = opts.scanDroppiness?.score;
  if (typeof score === 'number' && Number.isFinite(score)) {
    const spikeCount =
      opts.scanDroppiness?.spikeCount ??
      (Array.isArray(opts.scanDroppiness?.detail)
        ? opts.scanDroppiness!.detail!.length
        : null);

    const cached = {
      score,
      spikeCount: spikeCount ?? 0,
      nEff: spikeCount ?? 0,
      computedAt: new Date().toISOString(),
      method: 'bayesian_8h' as const,
    };
    const mapped = toFastDroppiness(cached);
    // If spike count unknown but score came from full scan UI, treat as OK when
    // score is present — scan already ran the full Bayesian path.
    next = {
      ...next,
      droppiness:
        spikeCount == null || spikeCount >= T.droppiness.minSpikes
          ? {
              status: 'OK',
              score,
              spikeCount: spikeCount,
              computedAt: cached.computedAt,
            }
          : mapped,
      flags: next.flags.filter((f) => !/droppiness\s+UNVERIFIED/i.test(f)),
    };
  }

  const ability = offeringAbilityFromExtracted(opts.extracted);
  if (ability) {
    const floatShares =
      normalizeShareCount(opts.extracted?.float) ?? next.fundamentals.float ?? null;
    const price =
      opts.extracted?.currentPrice ?? next.price.last ?? null;
    const publicFloatValue =
      floatShares != null && price != null ? floatShares * price : next.dilution.publicFloatValue;

    next = {
      ...next,
      dilution: {
        ...next.dilution,
        derivedOfferingAbility: ability,
        publicFloatValue,
      },
      fundamentals: {
        ...next.fundamentals,
        float: floatShares ?? next.fundamentals.float,
        marketCap: opts.extracted?.marketCap ?? next.fundamentals.marketCap,
        instOwn:
          opts.extracted?.institutionalOwnership != null
            ? opts.extracted.institutionalOwnership / 100
            : next.fundamentals.instOwn,
        shortInterest:
          opts.extracted?.shortInterest != null
            ? opts.extracted.shortInterest / 100
            : next.fundamentals.shortInterest,
        runwayMonths: opts.extracted?.cashRunway ?? next.fundamentals.runwayMonths,
      },
    };
  } else if (opts.extracted) {
    // Still overlay fundamentals even without a clear DT offering tag
    next = {
      ...next,
      fundamentals: {
        ...next.fundamentals,
        float: normalizeShareCount(opts.extracted.float) ?? next.fundamentals.float,
        marketCap: opts.extracted.marketCap ?? next.fundamentals.marketCap,
        instOwn:
          opts.extracted.institutionalOwnership != null
            ? opts.extracted.institutionalOwnership / 100
            : next.fundamentals.instOwn,
        shortInterest:
          opts.extracted.shortInterest != null
            ? opts.extracted.shortInterest / 100
            : next.fundamentals.shortInterest,
        runwayMonths: opts.extracted.cashRunway ?? next.fundamentals.runwayMonths,
      },
    };
  }

  if (hasEnrichedFundamentals(next.fundamentals)) {
    const unavailable = next.unavailable.filter((u) => u !== 'fundamentals');
    if (unavailable.length !== next.unavailable.length) {
      const dataCompleteness =
        Math.round(((FAST_SOURCE_COUNT - unavailable.length) / FAST_SOURCE_COUNT) * 1000) /
        1000;
      next = { ...next, unavailable, dataCompleteness };
      next = { ...next, ...recomputeWalkAway(next) };
    }
  }

  return next;
}
