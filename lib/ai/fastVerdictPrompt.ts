// lib/ai/fastVerdictPrompt.ts
//
// Slim Fast Verdict slice for the AI thesis prompt — avoids sending the full object.

import type { FastVerdict } from '@/lib/fast/types';
import type { FastVerdictPromptSlice } from './types';
import { formatNasdaqDeficiencySummary } from '@/lib/fast/fetchNasdaqDeficient';
import { formatRegShoSummary } from '@/lib/fast/fetchRegSho';
import { tickerChangeFlag } from '@/lib/fast/fetchTickerChanges';

function nasdaqListingPromptLine(verdict: FastVerdict): string | null {
  const listing = verdict.nasdaqListing;
  if (!listing) return null;
  if (listing.status === 'noncompliant') {
    const summary = formatNasdaqDeficiencySummary(listing);
    return summary
      ? `Nasdaq noncompliant — ${summary}`
      : 'Nasdaq noncompliant';
  }
  if (listing.status === 'not_listed') return 'not on Nasdaq noncompliant list';
  return 'Nasdaq list unavailable';
}

function regShoPromptLine(verdict: FastVerdict): string | null {
  const listing = verdict.regSho;
  if (!listing) return null;
  if (listing.status === 'threshold') {
    const summary = formatRegShoSummary(listing);
    return summary ? `Reg SHO threshold — ${summary}` : 'Reg SHO threshold';
  }
  if (listing.status === 'not_listed') return 'not on Reg SHO threshold list';
  return 'Reg SHO list unavailable';
}

function tickerChangesPromptLine(verdict: FastVerdict): string | null {
  const changes = verdict.tickerChanges;
  if (!changes) return null;
  if (changes.status === 'changed' || changes.status === 'ambiguous') {
    return tickerChangeFlag(changes);
  }
  if (changes.status === 'unavailable') return 'ticker-change history unavailable';
  return null;
}

export function fastVerdictToPromptSlice(verdict: FastVerdict): FastVerdictPromptSlice {
  return {
    verdict: verdict.verdict,
    reason: verdict.reason,
    flags: verdict.flags,
    runnerClass: verdict.runner.class,
    priorDayPct: verdict.runner.priorDayPct,
    threeDayRunPct: verdict.runner.threeDayRunPct,
    droppinessStatus: verdict.droppiness.status,
    droppinessScore: verdict.droppiness.score,
    newsClass: verdict.news.class,
    newsHeadline: verdict.news.headline,
    babyShelfCapacity: verdict.dilution.babyShelfCapacity,
    capacityQuarters: verdict.dilution.capacityQuarters,
    derivedOfferingAbility: verdict.dilution.derivedOfferingAbility,
    atmDetected: verdict.dilution.atmDetected,
    runwayMonths: verdict.fundamentals.runwayMonths,
    borrowAvailable: verdict.borrow.available,
    borrowFeePct: verdict.borrow.feePct,
    dataCompleteness: verdict.dataCompleteness,
    unavailable: verdict.unavailable,
    nasdaqListing: nasdaqListingPromptLine(verdict),
    regSho: regShoPromptLine(verdict),
    shortVolume: verdict.shortVolume?.sentence ?? null,
    tickerChanges: tickerChangesPromptLine(verdict),
  };
}
