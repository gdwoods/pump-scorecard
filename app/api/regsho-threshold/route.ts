import { NextRequest, NextResponse } from 'next/server';
import {
  cacheRegShoIndex,
  fetchRegShoFromNasdaqTrader,
  listingFromRegShoIndex,
  regShoIndexToRecord,
} from '@/lib/fast/fetchRegSho';
import { fetchRegShoFromFtp } from '@/lib/fast/fetchRegShoFtp';

export const runtime = 'nodejs';
export const revalidate = 3600;

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
};

export async function GET(req: NextRequest) {
  try {
    const ticker = req.nextUrl.searchParams.get('ticker')?.trim().toUpperCase() || '';
    const index = await cacheRegShoIndex(async () => {
      try {
        return await fetchRegShoFromNasdaqTrader();
      } catch (httpsErr) {
        console.warn(
          'regsho https failed, trying ftp',
          httpsErr instanceof Error ? httpsErr.message : httpsErr
        );
        return await fetchRegShoFromFtp();
      }
    });
    if (ticker) {
      return NextResponse.json(
        { listing: listingFromRegShoIndex(index, ticker) },
        { status: 200, headers: CACHE_HEADERS }
      );
    }
    return NextResponse.json(
      { listings: regShoIndexToRecord(index) },
      { status: 200, headers: CACHE_HEADERS }
    );
  } catch (err) {
    console.warn(
      'regsho-threshold route failed',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'regsho list unavailable' },
      { status: 502 }
    );
  }
}
