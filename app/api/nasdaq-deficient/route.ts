import { NextResponse } from 'next/server';
import {
  fetchNasdaqFromNasdaqDotCom,
  indexToRecord,
} from '@/lib/fast/fetchNasdaqDeficient';

export const runtime = 'nodejs';
export const revalidate = 3600;

export async function GET() {
  try {
    const index = await fetchNasdaqFromNasdaqDotCom();
    return NextResponse.json(
      { listings: indexToRecord(index) },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
        },
      }
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
