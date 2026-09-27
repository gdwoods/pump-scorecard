import { NextResponse } from 'next/server';
import {
  fetchRegShoFromNasdaqTrader,
  regShoIndexToRecord,
} from '@/lib/fast/fetchRegSho';

export const runtime = 'nodejs';
export const revalidate = 3600;

export async function GET() {
  try {
    const index = await fetchRegShoFromNasdaqTrader();
    return NextResponse.json(
      { listings: regShoIndexToRecord(index) },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
        },
      }
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
