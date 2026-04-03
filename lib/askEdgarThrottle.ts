/**
 * Global Ask Edgar HTTP throttle (one limiter per Node runtime).
 *
 * Next.js can load this module in more than one bundle; module-level `let` would
 * split the limiter and allow bursts (e.g. detail + top-gainers) to exceed the cap.
 * `globalThis` keeps a single sliding window for all Ask Edgar calls.
 *
 * Cap is set below the typical 10/s account limit to absorb clock skew and overlap
 * with other clients using the same key.
 */

export const ASK_EDGAR_MAX_REQUESTS_PER_SEC = 7;
const WINDOW_MS = 1000;

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
      if (state.recentStarts.length < ASK_EDGAR_MAX_REQUESTS_PER_SEC) {
        state.recentStarts.push(Date.now());
        return;
      }
      const oldest = state.recentStarts[0]!;
      const waitMs = oldest + WINDOW_MS - Date.now() + 5;
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
