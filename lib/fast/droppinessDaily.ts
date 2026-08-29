// lib/fast/droppinessDaily.ts
// Daily-bar droppiness approximation for /api/fast when KV is cold.
// Spec: spike = high ≥30% over prior close; failed = close ≥15% below session high.

import type { DailyBar } from './types';

export type DailyDroppinessResult = {
  score: number;
  spikeCount: number;
  failedCount: number;
};

export function droppinessFromDailyBars(bars: DailyBar[]): DailyDroppinessResult {
  let spikeCount = 0;
  let failedCount = 0;

  for (let i = 1; i < bars.length; i++) {
    const priorClose = bars[i - 1]?.c;
    const bar = bars[i];
    if (!priorClose || priorClose <= 0 || !bar) continue;

    const spikePct = (bar.h - priorClose) / priorClose;
    if (spikePct < 0.3) continue;

    spikeCount++;
    const retraceFromHigh = (bar.h - bar.c) / bar.h;
    if (retraceFromHigh >= 0.15) failedCount++;
  }

  const rate = spikeCount > 0 ? failedCount / spikeCount : 0;
  return {
    score: Math.round(rate * 100),
    spikeCount,
    failedCount,
  };
}
