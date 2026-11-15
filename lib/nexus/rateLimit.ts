import { createHash } from 'crypto';
import { edgeKvExpire, edgeKvGet, edgeKvIncr } from '@/lib/kv/edgeRead';

const KEY_PREFIX = 'nexus:rl:';
const WINDOW_SECONDS = 86400;

const localBuckets = new Map<string, { count: number; resetAt: number }>();

export function getNexusRateLimitPerDay(): number {
  const raw = process.env.NEXUS_RATE_LIMIT_PER_DAY?.trim();
  if (!raw) return 2000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 2000;
  return parsed;
}

function dayKey(apiKey: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const hash = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  return `${KEY_PREFIX}${hash}:${day}`;
}

function secondsUntilUtcMidnight(now = new Date()): number {
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.max(60, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
}

export type NexusRateLimitResult =
  | { allowed: true; remaining: number; limit: number }
  | { allowed: false; retryAfterSec: number; limit: number };

function checkLocal(apiKey: string, limit: number): NexusRateLimitResult {
  const now = Date.now();
  const key = dayKey(apiKey);
  const bucket = localBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    localBuckets.set(key, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
    return { allowed: true, remaining: limit - 1, limit };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000), limit };
  }
  bucket.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - bucket.count), limit };
}

export async function checkNexusRateLimit(apiKey: string): Promise<NexusRateLimitResult> {
  const limit = getNexusRateLimitPerDay();
  const key = dayKey(apiKey);
  const raw = await edgeKvGet(key);
  const used = raw ? Number.parseInt(raw, 10) || 0 : 0;

  if (raw == null) {
    return checkLocal(apiKey, limit);
  }

  if (used >= limit) {
    return { allowed: false, retryAfterSec: secondsUntilUtcMidnight(), limit };
  }
  return { allowed: true, remaining: Math.max(0, limit - used), limit };
}

export async function recordNexusApiCall(apiKey: string): Promise<void> {
  const key = dayKey(apiKey);
  const count = await edgeKvIncr(key);
  if (count == null) {
    checkLocal(apiKey, getNexusRateLimitPerDay());
    return;
  }
  if (count === 1) {
    await edgeKvExpire(key, WINDOW_SECONDS);
  }
}