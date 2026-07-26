// lib/fast/withTimeout.ts
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type SettledSource<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export async function settleSource<T>(
  label: string,
  ms: number,
  fn: () => Promise<T>
): Promise<SettledSource<T>> {
  try {
    const value = await withTimeout(fn(), ms, label);
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
