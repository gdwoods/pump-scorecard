// app/api/cron/wire-news/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pollWireNewsFeeds } from '@/lib/wireNews/poll';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set
  const auth = req.headers.get('authorization');
  if (cronSecret) {
    return auth === `Bearer ${cronSecret}`;
  }
  // Allow in development without secret
  if (process.env.NODE_ENV !== 'production') return true;
  // Production without CRON_SECRET: allow Vercel cron user-agent as weak gate
  const ua = req.headers.get('user-agent') || '';
  return ua.includes('vercel-cron');
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  try {
    const result = await pollWireNewsFeeds();

    // Hobby only allows 2 cron jobs — warm fast path here instead of a third cron
    try {
      const base =
        process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://short-check.vercel.app');
      await fetch(`${base}/api/fast/AAPL?fmt=json`, { cache: 'no-store' });
    } catch (warmErr) {
      console.warn('[cron/wire-news] warm failed', warmErr);
    }

    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - started,
      ...result,
    });
  } catch (err) {
    console.error('[cron/wire-news]', err);
    return NextResponse.json(
      {
        ok: false,
        elapsedMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// POST supported for manual triggers with the same auth
export const POST = GET;
