// lib/fast/evaluate.ts
import { classifyNewsHeadline } from './newsClassifier';
import { computeBabyShelf } from './babyShelf';
import { classifyRunner } from './runner';
import { evaluateWalkAways } from './walkAway';
import { droppinessFromDailyBars } from './droppinessDaily';
import { toFastDroppiness, cacheFromCompute } from '@/lib/droppiness/map';
import type { Tier2Bundle } from './fetchTier2';
import type { FastVerdict } from './types';

export function buildFastVerdict(
  ticker: string,
  tier2: Tier2Bundle,
  startedAt: number
): FastVerdict {
  const unavailable: string[] = [];
  const sourceKeys = [
    'snapshot',
    'bars',
    'fundamentals',
    'filings',
    'borrow',
    'news',
  ] as const;

  for (const k of sourceKeys) {
    if (!tier2[k].ok) unavailable.push(k);
  }

  const dataCompleteness = (sourceKeys.length - unavailable.length) / sourceKeys.length;

  const snap = tier2.snapshot.ok ? tier2.snapshot.value : null;
  const bars = tier2.bars.ok ? tier2.bars.value : [];
  const fund = tier2.fundamentals.ok ? tier2.fundamentals.value : null;
  const filings = tier2.filings.ok ? tier2.filings.value : null;
  const borrow = tier2.borrow.ok ? tier2.borrow.value : null;
  const newsBundle = tier2.news.ok ? tier2.news.value : null;
  const cachedDrop = tier2.droppiness.ok ? tier2.droppiness.value : null;

  const session = snap?.session ?? 'closed';
  let todayMovePct = snap?.todayMovePct ?? null;

  // Closed session: use prevDay high vs prior if needed
  if (session === 'closed' && todayMovePct == null && snap?.prevDay && bars.length >= 2) {
    const prev = bars[bars.length - 1];
    const prior = bars[bars.length - 2];
    if (prior?.c) todayMovePct = (prev.h - prior.c) / prior.c;
  }

  const runner = classifyRunner(bars);

  let volVs20d: number | null = null;
  if (bars.length >= 21) {
    const today = bars[bars.length - 1];
    const window = bars.slice(-21, -1);
    const avg = window.reduce((s, b) => s + b.v, 0) / window.length;
    if (avg > 0) volVs20d = today.v / avg;
  }

  const floatShares = fund?.float ?? null;
  const last = snap?.last ?? (bars.length ? bars[bars.length - 1].c : null);
  const floatRotation =
    floatShares && snap?.day?.v ? snap.day.v / floatShares : null;

  const classified = classifyNewsHeadline(newsBundle?.headline);
  const fatalWithWeasel =
    classified.matchedTerms.fatal.length > 0 &&
    classified.matchedTerms.weasel.length > 0;

  const burnData = tier2.burn.ok ? tier2.burn.value : null;
  const runwayMonths = burnData?.runwayMonths ?? null;
  const quarterlyBurn = burnData?.quarterlyBurn ?? null;
  const positiveFcf = burnData?.positiveFcf ?? false;

  const shelf = filings?.shelfSignals;
  const hasEffectiveShelf = shelf
    ? shelf.effectRecently || (shelf.shelfFiled ? true : null)
    : null;
  const atmDetected = shelf?.atmRecently ? true : null;

  const dilution = computeBabyShelf({
    floatShares,
    price: last,
    quarterlyBurn,
    atmDetected,
    hasEffectiveShelf,
  });

  // If we only have float×price baby shelf and capacity unknown, prefer LOW when thin
  let derivedOfferingAbility = dilution.derivedOfferingAbility;
  if (
    derivedOfferingAbility === 'UNKNOWN' &&
    dilution.babyShelfCapacity != null &&
    floatShares != null &&
    floatShares < 2e6
  ) {
    // Thin float with baby-shelf constraint → treat as not HIGH
    derivedOfferingAbility = 'LOW';
  }

  let droppiness = toFastDroppiness(cachedDrop ?? null);
  if (droppiness.reason === 'not_cached' && bars.length >= 10) {
    const daily = droppinessFromDailyBars(bars);
    droppiness = toFastDroppiness(
      cacheFromCompute({
        score: daily.score,
        spikeCount: daily.spikeCount,
        nEff: daily.spikeCount,
        detail: [],
        intraday: [],
      })
    );
    if (droppiness.status === 'UNVERIFIED' && daily.spikeCount >= 3) {
      droppiness = {
        status: 'OK',
        score: daily.score,
        spikeCount: daily.spikeCount,
        computedAt: new Date().toISOString(),
        reason: 'daily_approx',
      };
    } else if (droppiness.status === 'UNVERIFIED') {
      droppiness = { ...droppiness, reason: 'daily_approx' };
    }
  }

  const walk = evaluateWalkAways({
    dataCompleteness,
    todayMovePct,
    newsClass: classified.class,
    fatalWithWeasel,
    runnerClass: runner.class,
    borrowAvailable: borrow?.available ?? null,
    droppiness,
    instOwn: fund?.instOwn ?? null,
    marketCap: fund?.marketCap ?? null,
    runwayMonths,
    positiveFcf,
    floatShares,
    derivedOfferingAbility,
  });

  const flags = [...walk.flags];
  if (newsBundle?.tickerRecycleWarning) {
    flags.push('tickerRecycleWarning — old news may be from prior ticker occupant');
  }

  return {
    ticker: ticker.toUpperCase(),
    verdict: walk.verdict,
    reason: walk.reason,
    elapsedMs: Date.now() - startedAt,
    dataCompleteness: Math.round(dataCompleteness * 1000) / 1000,
    session,
    price: {
      last,
      todayMovePct,
      volVs20d,
      floatRotation,
    },
    runner,
    droppiness,
    filings: {
      today: filings?.filings ?? [],
      daysSinceLast: filings?.daysSinceLast ?? null,
    },
    fundamentals: {
      marketCap: fund?.marketCap ?? null,
      float: floatShares,
      instOwn: fund?.instOwn ?? null,
      shortInterest: fund?.shortInterest ?? null,
      runwayMonths,
    },
    borrow: {
      available: borrow?.available ?? null,
      feePct: borrow?.feePct ?? null,
    },
    news: {
      class: classified.class,
      headline: newsBundle?.headline ?? null,
      ageMinutes: newsBundle?.ageMinutes ?? null,
      source: newsBundle?.source ?? null,
      matchedTerms: classified.matchedTerms,
      tickerRecycleWarning: newsBundle?.tickerRecycleWarning ?? false,
    },
    dilution: {
      ...dilution,
      derivedOfferingAbility,
      atmDetected,
      equityLineCounterparty: null,
    },
    flags,
    unavailable,
  };
}
