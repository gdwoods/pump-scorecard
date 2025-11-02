// app/api/share/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getShare } from '@/lib/shareStorage';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400 }
      );
    }

    // Retrieve share data
    console.log(`[Share] Retrieving share: ${id}`);
    const shareData = await getShare(id);

    if (!shareData) {
      console.log(`[Share] Share not found: ${id}`);
      return NextResponse.json(
        { error: 'Share link not found or expired' },
        { status: 404 }
      );
    }

    // Check if expired (double-check)
    if (shareData.expiresAt < Date.now()) {
      return NextResponse.json(
        { error: 'Share link has expired' },
        { status: 410 } // Gone
      );
    }

    return NextResponse.json({
      ticker: shareData.ticker,
      extractedData: shareData.extractedData,
      result: shareData.result,
      createdAt: shareData.createdAt,
      expiresAt: shareData.expiresAt,
    });
  } catch (error: any) {
    console.error('Error retrieving share:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve share' },
      { status: 500 }
    );
  }
}

