import { NextRequest, NextResponse } from 'next/server';
import { computeNexusForTicker } from '@/lib/nexus/computeNexus';
import { parsePartnerTickers, readNexusUniverse } from '@/lib/nexus/kv';
import { secThrottleMs, sleepMs } from '@/lib/nexus/secContext';
import { readUniverse as readDroppinessUniverse } from '@/lib/droppiness/kv';
import { getKVClient } from '@/lib/shareStorage';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** SEC-heavy — keep batches small on Hobby. */
const MAX_TICKERS_PER_RUN = 5;
const WARM_CURSOR_KEY = 'nexus:warm:cursor';

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

async function readWarmCursor(): Promise<number> {
  const kv = await getKVClient();
  if (!kv) return 0;
  try {
    const raw = await kv.get(WARM_CURSOR_KEY);
    if (!raw) return 0;
    const n = Number.parseInt(String(raw), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

async function writeWarmCursor(offset: number): Promise<void> {
  const kv = await getKVClient();
  if (!kv) return;
  try {
    const ttl = 90 * 86400;
    await kv.set(WARM_CURSOR_KEY, String(offset), { ex: ttl });
  } catch {
  }
}

async function pickTickers(): Promise<string[]> {
  const partner = parsePartnerTickers();
  const nexusUni = await readNexusUniverse();
  const dropUni = await readDroppinessUniverse();
  const merged = [...new Set([...partner, ...nexusUni, ...dropUni])];
  if (merged.length === 0) return [];

  const offset = await readWarmCursor();
  const rotated = [...merged.slice(offset), ...merged.slice(0, offset)];
  const batch = rotated.slice(0, MAX_TICKERS_PER_RUN);
  const nextOffset = (offset + batch.length) % merged.length;
  await writeWarmCursor(nextOffset);
  return batch;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const results: Array<{
    ticker: string;
    ok: boolean;
    status?: string;
    error?: string;
  }> = [];

  try {
    const tickers = await pickTickers();
    for (const ticker of tickers) {
      try {
        await sleepMs(secThrottleMs());
        const response = await computeNexusForTicker(ticker, {
          force: true,
          enrollUniverse: true,
        });
        results.push({ ticker, ok: true, status: response.status });
      } catch (err) {
        results.push({
          ticker,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - started,
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error('[cron/nexus-warm]', err);
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