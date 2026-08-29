// lib/fast/walkAwayReasons.ts
// Human-readable Framework 3.0 walk-away rule codes for UI tooltips.

import { T } from '@/lib/config/thresholds';

const PCT = (n: number) => `${Math.round(n * 100)}%`;

export const FAST_WALK_AWAY_REASONS: Record<string, string> = {
  'W1:dataCompleteness': `Data completeness below ${PCT(T.dataQuality.minCompleteness)} — too many market sources missing to trust a fast screen.`,
  'W2:todayMove': `Today's move is below the ${PCT(T.todayMove.min)} discretionary pump-day threshold — not a hard walk-away; use judgment (Short Check / Tier 3).`,
  'W3:fatalNews': 'Headline matches fatal catalyst keywords (e.g. FDA approval) — real fundamental news, not a typical pump fade setup.',
  'W4:RUNNER_YESTERDAY': `Prior session was a runner (≥${PCT(T.runner.priorDay)} move) — elevated squeeze / continuation risk.`,
  'W4:RUNNER_MULTIDAY': `Multi-day runner (≥${PCT(T.runner.threeDay)} over 3 sessions) — elevated squeeze / continuation risk.`,
  'W5:borrowUnavailable': 'Borrow desk reports shares unavailable — cannot execute the short.',
  'W6:droppiness': `Droppiness score below ${T.droppiness.walkAway} with enough spikes — history shows pumps tend to hold, not fade.`,
  'W7:instOwn': `Institutional ownership ≥${PCT(T.instOwn.walkAway)} — crowded / sticky holder base.`,
  'W8:marketCap': `Market cap above ${(T.marketCap.max / 1e6).toFixed(0)}M — outside small-cap pump universe.`,
  'W9:runway': `Cash runway ≥${T.runway.walkAway} months or positive FCF — not a distressed dilution candidate.`,
  'W10:squeezeGeometry': `Float under ${(T.float.squeezeFloor / 1e6).toFixed(0)}M with non-HIGH offering ability — squeeze geometry (matches Short Check TRAP_RISK).`,
};

export function describeFastWalkAwayReason(reason: string | null | undefined): string | undefined {
  if (!reason) return undefined;
  return FAST_WALK_AWAY_REASONS[reason];
}

/** Tooltip for soft flags that embed a W-code prefix. */
export function describeFastWalkAwayFlag(flag: string): string | undefined {
  const code = flag.match(/^(W\d+:[\w]+)/)?.[1];
  if (code && FAST_WALK_AWAY_REASONS[code]) return FAST_WALK_AWAY_REASONS[code];
  if (flag.includes('squeeze geometry')) return FAST_WALK_AWAY_REASONS['W10:squeezeGeometry'];
  if (/droppiness\s+UNVERIFIED/i.test(flag)) {
    return 'Droppiness not cached or fewer than 3 spikes — score is informational only on the fast screen.';
  }
  return undefined;
}
