// lib/config/thresholds.ts
// Single source of truth for screening thresholds (Framework 3.0).
// No numeric screening threshold may appear as a literal elsewhere.

export const T = {
  droppiness: { walkAway: 40, strong: 70, minSpikes: 3, cacheDays: 7 },
  marketCap: { ideal: 10e6, max: 50e6 },
  float: { squeezeFloor: 2e6, thin: 5e6 },
  instOwn: { ideal: 0.10, walkAway: 0.40 }, // fractions; ExtractedData uses 0–100
  runway: { ideal: 6, walkAway: 18 }, // months
  runner: { priorDay: 0.30, threeDay: 0.30 },
  todayMove: { min: 0.30 },
  borrow: { requireAvailable: true },
  volume: { minSharesPerMin: 50_000, anomalyMult: 5 },
  dataQuality: { minCompleteness: 0.70 },
  timeouts: { perSourceMs: 1500, totalMs: 2500 },
  /** Short Check category rating floors (percent). */
  category: {
    highPriority: 80,
    moderate: 70,
    speculative: 65,
  },
} as const;

export type Thresholds = typeof T;
