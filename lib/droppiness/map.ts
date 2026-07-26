// lib/droppiness/map.ts — Edge-safe helpers (no Redis / Node clients)
import { T } from '@/lib/config/thresholds';
import type { FastVerdict } from '@/lib/fast/types';
import { DROP_METHOD, type CachedDroppiness, type DroppinessComputeResult } from './types';

export function cacheFromCompute(
  result: DroppinessComputeResult
): CachedDroppiness {
  return {
    score: result.score,
    spikeCount: result.spikeCount,
    nEff: result.nEff,
    computedAt: new Date().toISOString(),
    method: DROP_METHOD,
  };
}

/** Map cache → FastVerdict.droppiness (UNVERIFIED when spikes < minSpikes). */
export function toFastDroppiness(
  cached: CachedDroppiness | null
): FastVerdict['droppiness'] {
  if (!cached) {
    return {
      status: 'UNVERIFIED',
      score: null,
      spikeCount: null,
      computedAt: null,
      reason: 'not_cached',
    };
  }
  if (cached.spikeCount < T.droppiness.minSpikes) {
    return {
      status: 'UNVERIFIED',
      score: cached.score,
      spikeCount: cached.spikeCount,
      computedAt: cached.computedAt,
      reason: 'insufficient_spikes',
    };
  }
  return {
    status: 'OK',
    score: cached.score,
    spikeCount: cached.spikeCount,
    computedAt: cached.computedAt,
  };
}
