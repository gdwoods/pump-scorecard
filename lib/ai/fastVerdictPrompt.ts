// lib/ai/fastVerdictPrompt.ts
//
// Slim Fast Verdict slice for the AI thesis prompt — avoids sending the full object.

import type { FastVerdict } from '@/lib/fast/types';
import type { FastVerdictPromptSlice } from './types';

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
    borrowAvailable: verdict.borrow.available,
    borrowFeePct: verdict.borrow.feePct,
    dataCompleteness: verdict.dataCompleteness,
    unavailable: verdict.unavailable,
  };
}
