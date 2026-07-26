// lib/droppiness/types.ts
export type DroppinessDetail = {
  date: string;
  spikePct: number;
  retraced: boolean;
};

export type IntradayCandle = {
  bucketTime: number;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type DroppinessComputeResult = {
  score: number;
  spikeCount: number;
  nEff: number;
  detail: DroppinessDetail[];
  intraday: IntradayCandle[];
};

/** Compact Tier-1 payload stored at drop:{TICKER} */
export type CachedDroppiness = {
  score: number;
  spikeCount: number;
  nEff: number;
  computedAt: string; // ISO
  method: 'bayesian_8h';
};

export const DROP_KV_PREFIX = 'drop:';
export const DROP_UNIVERSE_KEY = 'drop:universe';
export const DROP_METHOD = 'bayesian_8h' as const;
