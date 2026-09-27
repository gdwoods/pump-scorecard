import { NextRequest, NextResponse } from 'next/server';
import {
  fetchNasdaqFromNasdaqDotComCached,
  indexToRecord,
  listingFromIndex,
} from '@/lib/fast/fetchNasdaqDeficient';

export const runtime = 'nodejs';
export const revalidate = 3600;

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
};

export async function GET(req: NextRequest) {
  try {
    const ticker = req.nextUrl.searchParams.get('ticker')?.trim().toUpperCase() || '';
    const index = await fetchNasdaqFromNasdaqDotComCached();
    if (ticker) {
      return NextResponse.json(
        { listing: listingFromIndex(index, ticker) },
        { status: 200, headers: CACHE_HEADERS }
      );
    }
    return NextResponse.json(
      { listings: indexToRecord(index) },
      { status: 200, headers: CACHE_HEADERS }
    );
  } catch (err) {
    console.warn(
      'nasdaq-deficient route failed',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'nasdaq list unavailable' },
      { status: 502 }
    );
  }
}
