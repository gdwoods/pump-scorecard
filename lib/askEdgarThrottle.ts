/**
 * Global Ask Edgar HTTP throttle (one limiter per Node runtime).
 *
 * Next.js can load this module in more than one bundle; module-level state would
 * split the limiter. `globalThis` keeps a single sliding window for all Ask Edgar calls.
 *
 * Plan limit: **150 requests per minute** — we use a rolling 60s window with a small
 * safety margin so clock skew and other clients on the same key are less likely to 429.
 */

/** Documented account cap (requests per rolling minute). */
export const ASK_EDGAR_MAX_REQUESTS_PER_MINUTE = 150;

/** Effective cap (slightly under plan limit). */
const EFFECTIVE_MAX_PER_MINUTE = 148;

const WINDOW_MS = 60_000;

const GLOBAL_KEY = "__pumpScorecardAskEdgarThrottle" as const;

type ThrottleState = {
  recentStarts: number[];
  chain: Promise<void>;
};

type GlobalWithThrottle = typeof globalThis & {
  [GLOBAL_KEY]?: ThrottleState;
};

function getState(): ThrottleState {
  const g = globalThis as GlobalWithThrottle;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      recentStarts: [],
      chain: Promise.resolve(),
    };
  }
  return g[GLOBAL_KEY]!;
}

function prune(state: ThrottleState, cutoffMs: number) {
  while (state.recentStarts.length > 0 && state.recentStarts[0]! < cutoffMs) {
    state.recentStarts.shift();
  }
}

/**
 * Resolves when an Ask Edgar request may begin. Call immediately before each fetch to eapi.askedgar.io.
 */
export function acquireAskEdgarRequestSlot(): Promise<void> {
  const state = getState();
  const run = async () => {
    for (;;) {
      const now = Date.now();
      prune(state, now - WINDOW_MS);
      if (state.recentStarts.length < EFFECTIVE_MAX_PER_MINUTE) {
        state.recentStarts.push(Date.now());
        return;
      }
      const oldest = state.recentStarts[0]!;
      const waitMs = oldest + WINDOW_MS - Date.now() + 10;
      await new Promise((r) => setTimeout(r, Math.max(1, waitMs)));
    }
  };

  const p = state.chain.then(run, run);
  state.chain = p.then(
    () => undefined,
    () => undefined
  );
  return p;
}
