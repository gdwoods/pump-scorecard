// app/api/cron/droppiness/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { T } from '@/lib/config/thresholds';
import { computeDroppiness } from '@/lib/droppiness/compute';
import {
  addToUniverse,
  persistDroppiness,
  readDroppiness,
  readUniverse,
} from '@/lib/droppiness/kv';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Seed tickers so the universe isn't empty before any scan warms it. */
const SEED = ['DFNS', 'AAPL'];

/** Polygon 1m history is heavy — keep per-run budget small on Hobby. */
const MAX_TICKERS_PER_RUN = 2;

function authorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (cronSecret) {
    return auth === `Bearer ${cronSecret}`;
  }
  if (process.env.NODE_ENV !== 'production') return true;
  const ua = req.headers.get('user-agent') || '';
  return ua.includes('vercel-cron');
}

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://short-check.vercel.app';
}

async function warmFastPath(): Promise<void> {
  try {
    await fetch(`${baseUrl()}/api/fast/AAPL?fmt=json`, { cache: 'no-store' });
  } catch (err) {
    console.warn('[cron/droppiness] warm failed', err);
  }
}

function parseWatchlist(): string[] {
  const raw = process.env.DROPPINESS_WATCHLIST || '';
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

async function pickTickers(): Promise<string[]> {
  const fromEnv = parseWatchlist();
  const fromKv = await readUniverse();
  const merged = [...new Set([...fromEnv, ...SEED, ...fromKv])];

  const staleMs = (T.droppiness.cacheDays * 86400 * 1000) / 2; // refresh at ~half TTL
  const scored: Array<{ ticker: string; priority: number }> = [];

  for (const ticker of merged) {
    const cached = await readDroppiness(ticker);
    if (!cached) {
      scored.push({ ticker, priority: 0 });
      continue;
    }
    const age = Date.now() - new Date(cached.computedAt).getTime();
    if (!Number.isFinite(age) || age > staleMs) {
      scored.push({ ticker, priority: age });
    }
  }

  scored.sort((a, b) => a.priority - b.priority);
  return scored.slice(0, MAX_TICKERS_PER_RUN).map((s) => s.ticker);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const results: Array<{
    ticker: string;
    ok: boolean;
    score?: number;
    spikeCount?: number;
    error?: string;
  }> = [];

  try {
    // Ensure seeds are enrolled even if we skip computing them this run
    for (const t of SEED) void addToUniverse(t);

    const tickers = await pickTickers();
    for (const ticker of tickers) {
      try {
        const computed = await computeDroppiness(ticker);
        const wrote = await persistDroppiness(ticker, computed);
        results.push({
          ticker,
          ok: wrote,
          score: computed.score,
          spikeCount: computed.spikeCount,
        });
      } catch (err) {
        results.push({
          ticker,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await warmFastPath();

    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - started,
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error('[cron/droppiness]', err);
    return NextResponse.json(
      {
        ok: false,
        elapsedMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
        results,
      },
      { status: 500 }
    );
  }
}

export const POST = GET;
