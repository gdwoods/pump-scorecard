// lib/droppiness/kv.ts
import { T } from '@/lib/config/thresholds';
import { edgeKvGet } from '@/lib/kv/edgeRead';
import { getKVClient } from '@/lib/shareStorage';
import { cacheFromCompute } from './map';
import {
  DROP_KV_PREFIX,
  DROP_UNIVERSE_KEY,
  type CachedDroppiness,
  type DroppinessComputeResult,
} from './types';

function keyFor(ticker: string): string {
  return `${DROP_KV_PREFIX}${ticker.toUpperCase()}`;
}

export function dropTtlSeconds(): number {
  return T.droppiness.cacheDays * 86400;
}

export async function readDroppiness(
  ticker: string
): Promise<CachedDroppiness | null> {
  const key = keyFor(ticker);

  // Edge runtime: REST read (node-redis does not run on /api/fast)
  try {
    const rawEdge = await edgeKvGet(key);
    if (rawEdge) {
      const parsed = JSON.parse(rawEdge) as CachedDroppiness;
      if (typeof parsed?.score === 'number' && typeof parsed?.spikeCount === 'number') {
        return parsed;
      }
    }
  } catch (err) {
    console.error('[droppiness] edge KV read failed', ticker, err);
  }

  const kv = await getKVClient();
  if (!kv) return null;
  try {
    const raw = await kv.get(key);
    if (!raw) return null;
    const parsed =
      typeof raw === 'string' ? (JSON.parse(raw) as CachedDroppiness) : (raw as CachedDroppiness);
    if (typeof parsed?.score !== 'number' || typeof parsed?.spikeCount !== 'number') {
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('[droppiness] KV read failed', ticker, err);
    return null;
  }
}

export async function writeDroppiness(
  ticker: string,
  cached: CachedDroppiness
): Promise<boolean> {
  const kv = await getKVClient();
  if (!kv) return false;
  const ttl = dropTtlSeconds();
  const payload = JSON.stringify(cached);
  try {
    await kv.set(keyFor(ticker), payload, { ex: ttl });
    return true;
  } catch {
    try {
      if (typeof kv.setEx === 'function') {
        await kv.setEx(keyFor(ticker), ttl, payload);
        return true;
      }
      if (typeof kv.setex === 'function') {
        await kv.setex(keyFor(ticker), ttl, payload);
        return true;
      }
      await kv.set(keyFor(ticker), payload);
      return true;
    } catch (err2) {
      console.error('[droppiness] KV write failed', ticker, err2);
      return false;
    }
  }
}

export async function readUniverse(): Promise<string[]> {
  const kv = await getKVClient();
  if (!kv) return [];
  try {
    const raw = await kv.get(DROP_UNIVERSE_KEY);
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t) => String(t).toUpperCase())
      .filter((t) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(t));
  } catch (err) {
    console.error('[droppiness] universe read failed', err);
    return [];
  }
}

export async function addToUniverse(ticker: string): Promise<void> {
  const upper = ticker.toUpperCase();
  const kv = await getKVClient();
  if (!kv) return;
  try {
    const existing = await readUniverse();
    if (existing.includes(upper)) return;
    const next = [upper, ...existing].slice(0, 400);
    const payload = JSON.stringify(next);
    const ttl = 90 * 86400; // keep universe around for ~90d
    try {
      await kv.set(DROP_UNIVERSE_KEY, payload, { ex: ttl });
    } catch {
      if (typeof kv.setEx === 'function') {
        await kv.setEx(DROP_UNIVERSE_KEY, ttl, payload);
      } else if (typeof kv.setex === 'function') {
        await kv.setex(DROP_UNIVERSE_KEY, ttl, payload);
      } else {
        await kv.set(DROP_UNIVERSE_KEY, payload);
      }
    }
  } catch (err) {
    console.error('[droppiness] universe write failed', err);
  }
}

/** Persist compute result + enroll ticker in refresh universe (best-effort). */
export async function persistDroppiness(
  ticker: string,
  result: DroppinessComputeResult
): Promise<boolean> {
  const ok = await writeDroppiness(ticker, cacheFromCompute(result));
  void addToUniverse(ticker);
  return ok;
}

export { toFastDroppiness, cacheFromCompute } from './map';
