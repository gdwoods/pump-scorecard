// lib/fast/classifyFlags.ts
//
// Separates binding fast walk-aways (verdict.reason) from discretionary soft flags.

import { describeFastWalkAwayReason } from './walkAwayReasons';

const SOFT_FLAG_PATTERNS: RegExp[] = [
  /^W2:todayMove/i,
  /droppiness\s+UNVERIFIED/i,
  /headline has FATAL \+ WEASEL/i,
  /ideal catalyst keywords matched/i,
  /^unexplained move/i,
  /thin float .* squeeze geometry/i,
  /tickerRecycleWarning/i,
];

/** Discretionary fast-screen flags — never hard NO_TRADE vetoes on their own. */
export function isSoftFastFlag(flag: string): boolean {
  return SOFT_FLAG_PATTERNS.some((pattern) => pattern.test(flag));
}

export function splitFastFlags(flags: string[]): { soft: string[]; other: string[] } {
  const soft: string[] = [];
  const other: string[] = [];
  for (const flag of flags) {
    (isSoftFastFlag(flag) ? soft : other).push(flag);
  }
  return { soft, other };
}

/** Hard fast walk-away codes carried on verdict.reason (W1–W10). */
export function isHardFastWalkAwayReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return /^W\d+:/.test(reason);
}

export function formatBindingFastWalkAway(
  verdict: string,
  reason: string | null | undefined
): string | null {
  if (!reason || !isHardFastWalkAwayReason(reason)) return null;
  const detail = describeFastWalkAwayReason(reason);
  if (verdict === 'NO_TRADE') {
    return `Hard walk-away (BINDING — do not argue around): ${reason}${detail ? ` — ${detail}` : ''}`;
  }
  if (verdict === 'WATCH') {
    return `Screen halt (BINDING — WATCH): ${reason}${detail ? ` — ${detail}` : ''}`;
  }
  return null;
}

export function formatSoftFastFlags(flags: string[]): string | null {
  const { soft } = splitFastFlags(flags);
  if (!soft.length) return null;
  return `Soft flags (NOT binding — discretionary context only; never describe as walk-away vetoes): ${soft.join(' | ')}`;
}

export function formatOtherFastFlags(flags: string[]): string | null {
  const { other } = splitFastFlags(flags);
  if (!other.length) return null;
  return `Additional fast-screen flags: ${other.join(' | ')}`;
}
