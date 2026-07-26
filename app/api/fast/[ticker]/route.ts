// app/api/fast/[ticker]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchAllTier } from '@/lib/fast/fetchTier2';
import { buildFastVerdict } from '@/lib/fast/evaluate';
import { formatFastVerdictText } from '@/lib/fast/formatText';

export const runtime = 'edge';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ ticker: string }> }
) {
  const startedAt = Date.now();
  const { ticker: raw } = await ctx.params;
  const ticker = (raw || '').trim().toUpperCase();

  if (!ticker || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) {
    return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
  }

  const fmt = req.nextUrl.searchParams.get('fmt') === 'text' ? 'text' : 'json';

  try {
    const tier2 = await fetchAllTier(ticker);
    const verdict = buildFastVerdict(ticker, tier2, startedAt);

    // Never emit anything other than the three allowed verdicts
    if (
      verdict.verdict !== 'NO_TRADE' &&
      verdict.verdict !== 'WATCH' &&
      verdict.verdict !== 'REVIEW'
    ) {
      verdict.verdict = 'WATCH';
      verdict.reason = 'W1:dataCompleteness';
    }

    if (fmt === 'text') {
      return new NextResponse(formatFastVerdictText(verdict), {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      });
    }

    return NextResponse.json(verdict, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    console.error('fast verdict error', err);
    return NextResponse.json(
      {
        ticker,
        verdict: 'WATCH',
        reason: 'W1:dataCompleteness',
        elapsedMs: Date.now() - startedAt,
        dataCompleteness: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
        unavailable: ['all'],
        flags: ['endpoint error — treat as insufficient data'],
      },
      { status: 200 }
    );
  }
}
