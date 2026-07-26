// lib/fast/runner.ts
import { T } from '@/lib/config/thresholds';
import type { DailyBar, RunnerClass } from './types';

/**
 * Classify the setup from daily bars.
 * c1 = prior close (yesterday), c2 = 2 sessions ago, c3 = 3 sessions ago
 * h20 = max high across the 20 sessions before today
 */
export function classifyRunner(barsOldestFirst: DailyBar[]): {
  class: RunnerClass;
  priorDayPct: number | null;
  threeDayRunPct: number | null;
  pctOff20dHigh: number | null;
} {
  if (barsOldestFirst.length < 4) {
    return {
      class: 'MIXED',
      priorDayPct: null,
      threeDayRunPct: null,
      pctOff20dHigh: null,
    };
  }

  // Exclude today (last bar) for prior-day context — use completed sessions
  const completed = barsOldestFirst.slice(0, -1);
  if (completed.length < 3) {
    return {
      class: 'MIXED',
      priorDayPct: null,
      threeDayRunPct: null,
      pctOff20dHigh: null,
    };
  }

  const c1 = completed[completed.length - 1].c;
  const c2 = completed[completed.length - 2].c;
  const c3 = completed[completed.length - 3].c;

  const priorWindow = completed.slice(Math.max(0, completed.length - 20));
  const h20 = Math.max(...priorWindow.map((b) => b.h));

  const priorDayPct = c2 !== 0 ? (c1 - c2) / c2 : null;
  const threeDayRunPct = c3 !== 0 ? (c1 - c3) / c3 : null;
  const pctOff20dHigh = h20 !== 0 ? (c1 - h20) / h20 : null;

  let runnerClass: RunnerClass = 'MIXED';
  if (threeDayRunPct != null && threeDayRunPct > T.runner.threeDay) {
    runnerClass = 'RUNNER_MULTIDAY';
  } else if (priorDayPct != null && priorDayPct > T.runner.priorDay) {
    runnerClass = 'RUNNER_YESTERDAY';
  } else if (c1 < h20 * 0.6) {
    runnerClass = 'CLEAN';
  }

  return {
    class: runnerClass,
    priorDayPct,
    threeDayRunPct,
    pctOff20dHigh,
  };
}

/**
 * Fixture helper matching the handoff formula on a single spike day.
 * bars = chronological closes ending at the day BEFORE the spike day (c1..),
 * plus h20 from the 20 sessions before today.
 */
export function classifyRunnerFromCloses(input: {
  c1: number;
  c2: number;
  c3: number;
  h20: number;
}): RunnerClass {
  const { c1, c2, c3, h20 } = input;
  if ((c1 - c3) / c3 > T.runner.threeDay) return 'RUNNER_MULTIDAY';
  if ((c1 - c2) / c2 > T.runner.priorDay) return 'RUNNER_YESTERDAY';
  if (c1 < h20 * 0.6) return 'CLEAN';
  return 'MIXED';
}
