// lib/ai/rateLimit.ts
//
// Per-IP rate limit for /api/ai-thesis using Upstash/Vercel KV REST.
// Fails open when KV is not configured so local dev still works.

import { edgeKvExpire, edgeKvIncr } from '@/lib/kv/edgeRead';

const KEY_PREFIX = 'ai-thesis:rl:';
/** Requests allowed per IP per rolling window. */
const LIMIT_PER_WINDOW = 10;
/** Window length in seconds (1 hour). */
const WINDOW_SECONDS = 60 * 60;

const localBuckets = new Map<string, { count: number; resetAt: number }>();

/** Comma-separated IPs in AI_THESIS_RATE_LIMIT_WHITELIST bypass the hourly cap. */
export function getAiThesisRateLimitWhitelist(): Set<string> {
  const raw = process.env.AI_THESIS_RATE_LIMIT_WHITELIST ?? '';
  return new Set(
    raw
      .split(/[\s,]+/)
      .map((ip) => ip.trim())
      .filter(Boolean)
  );
}

export function isAiThesisRateLimitWhitelisted(clientIp: string): boolean {
  if (!clientIp || clientIp === 'unknown') return false;
  return getAiThesisRateLimitWhitelist().has(clientIp);
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

function checkLocalRateLimit(clientIp: string): RateLimitResult {
  const now = Date.now();
  const bucket = localBuckets.get(clientIp);
  if (!bucket || now >= bucket.resetAt) {
    localBuckets.set(clientIp, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
    return { allowed: true };
  }
  if (bucket.count >= LIMIT_PER_WINDOW) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true };
}

export async function checkAiThesisRateLimit(clientIp: string): Promise<RateLimitResult> {
  if (isAiThesisRateLimitWhitelisted(clientIp)) {
    return { allowed: true };
  }

  const key = `${KEY_PREFIX}${clientIp}`;
  const count = await edgeKvIncr(key);

  if (count == null) {
    return checkLocalRateLimit(clientIp);
  }

  if (count === 1) {
    await edgeKvExpire(key, WINDOW_SECONDS);
  }

  if (count > LIMIT_PER_WINDOW) {
    return { allowed: false, retryAfterSec: WINDOW_SECONDS };
  }

  return { allowed: true };
}

export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp.slice(0, 128);
  return 'unknown';
}
