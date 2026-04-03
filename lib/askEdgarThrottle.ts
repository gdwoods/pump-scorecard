/**
 * Global Ask Edgar HTTP throttle (per Node process / serverless instance).
 * Sliding 1s window: at most N request starts per second across detail + top-gainers.
 */

export const ASK_EDGAR_MAX_REQUESTS_PER_SEC = 10;
const WINDOW_MS = 1000;

const recentStarts: number[] = [];

function prune(cutoffMs: number) {
  while (recentStarts.length > 0 && recentStarts[0]! < cutoffMs) {
    recentStarts.shift();
  }
}

let chain: Promise<void> = Promise.resolve();

/**
 * Resolves when an Ask Edgar request may begin. Call immediately before each fetch to eapi.askedgar.io.
 */
export function acquireAskEdgarRequestSlot(): Promise<void> {
  const run = async () => {
    for (;;) {
      const now = Date.now();
      prune(now - WINDOW_MS);
      if (recentStarts.length < ASK_EDGAR_MAX_REQUESTS_PER_SEC) {
        recentStarts.push(Date.now());
        return;
      }
      const oldest = recentStarts[0]!;
      const waitMs = oldest + WINDOW_MS - Date.now() + 2;
      await new Promise((r) => setTimeout(r, Math.max(1, waitMs)));
    }
  };

  const p = chain.then(run, run);
  chain = p.then(
    () => undefined,
    () => undefined
  );
  return p;
}
