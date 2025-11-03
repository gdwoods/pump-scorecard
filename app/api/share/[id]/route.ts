// app/api/share/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getShare } from '@/lib/shareStorage';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  try {
    const { id } = await context.params;

    if (!id) {
      console.log(`[Share API] Missing share ID`);
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400 }
      );
    }

    console.log(`[Share API] Retrieving share: ${id} (host: ${req.headers.get('host')})`);
    
    // Retrieve share data with timeout protection
    const shareData = await Promise.race([
      getShare(id),
      new Promise<null>((resolve) => 
        setTimeout(() => {
          console.error(`[Share API] Timeout retrieving share: ${id}`);
          resolve(null);
        }, 8000) // 8 second timeout
      ),
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`[Share API] Retrieved share ${id} in ${elapsed}ms, found: ${!!shareData}`);

    if (!shareData) {
      console.log(`[Share API] Share not found or timeout: ${id}`);
      return NextResponse.json(
        { error: 'Share link not found or expired' },
        { status: 404 }
      );
    }

    // Check if expired (double-check)
    if (shareData.expiresAt < Date.now()) {
      console.log(`[Share API] Share expired: ${id}, expired at ${new Date(shareData.expiresAt).toISOString()}`);
      return NextResponse.json(
        { error: 'Share link has expired' },
        { status: 410 } // Gone
      );
    }

    console.log(`[Share API] Successfully returning share data for ${shareData.ticker}`);
    return NextResponse.json({
      ticker: shareData.ticker,
      extractedData: shareData.extractedData,
      result: shareData.result,
      createdAt: shareData.createdAt,
      expiresAt: shareData.expiresAt,
    });
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[Share API] Error retrieving share after ${elapsed}ms:`, error);
    console.error(`[Share API] Error stack:`, error?.stack);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to retrieve share',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

