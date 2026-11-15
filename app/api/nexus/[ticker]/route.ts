import { NextRequest, NextResponse } from 'next/server';
import { extractNexusApiKey, getConfiguredNexusApiKey, verifyNexusApiKey } from '@/lib/nexus/auth';
import { computeNexusForTicker } from '@/lib/nexus/computeNexus';
import { checkNexusRateLimit, recordNexusApiCall } from '@/lib/nexus/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ ticker: string }> }
) {
  const configured = getConfiguredNexusApiKey();
  if (!configured) {
    return NextResponse.json(
      { error: 'Nexus API is not configured on this deployment.' },
      { status: 503 }
    );
  }

  const provided = extractNexusApiKey(req);
  if (!verifyNexusApiKey(provided)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await checkNexusRateLimit(provided!);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: 'Daily API limit reached for this key.',
        retryAfterSec: rl.retryAfterSec,
        limit: rl.limit,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSec) },
      }
    );
  }

  const { ticker: raw } = await ctx.params;
  const ticker = (raw || '').trim().toUpperCase();
  if (!ticker || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
    return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
  }

  const force = req.nextUrl.searchParams.get('refresh') === '1';

  try {
    const response = await computeNexusForTicker(ticker, { force, enrollUniverse: true });
    await recordNexusApiCall(provided!);

    return NextResponse.json(response, {
      status: 200,
      headers: {
        ...CACHE_HEADERS,
        'X-RateLimit-Limit': String(rl.limit),
        'X-RateLimit-Remaining': String(Math.max(0, rl.remaining - 1)),
      },
    });
  } catch (err) {
    console.error('[nexus api]', ticker, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Nexus lookup failed' },
      { status: 500 }
    );
  }
}