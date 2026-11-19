import { NextRequest, NextResponse } from 'next/server';
import { fetchRegShoShortVolume } from '@/lib/fast/fetchRegShoShortVolume';
import {
  REG_SHO_SHORT_VOLUME_SOURCE,
  regShoShortVolumeCacheSeconds,
} from '@/lib/fast/regShoShortVolume';

export const runtime = 'nodejs';

function cacheHeaders(): Record<string, string> {
  const seconds = regShoShortVolumeCacheSeconds();
  return {
    'Cache-Control': `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=21600`,
  };
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')?.trim().toUpperCase() || '';
  if (!ticker || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) {
    return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
  }

  try {
    const days = await fetchRegShoShortVolume(ticker);
    return NextResponse.json(
      {
        ticker,
        status: days.length > 0 ? 'ok' : 'empty',
        sourceUrl: REG_SHO_SHORT_VOLUME_SOURCE,
        days,
      },
      { status: 200, headers: cacheHeaders() }
    );
  } catch (err) {
    console.warn(
      'regsho-short-volume route failed',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      {
        ticker,
        status: 'unavailable',
        sourceUrl: REG_SHO_SHORT_VOLUME_SOURCE,
        days: [],
        error: err instanceof Error ? err.message : 'short volume unavailable',
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
