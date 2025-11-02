// app/api/share/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateShareId, saveShare } from '@/lib/shareStorage';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, extractedData, result } = body;

    if (!ticker || !extractedData || !result) {
      return NextResponse.json(
        { error: 'Missing required data: ticker, extractedData, or result' },
        { status: 400 }
      );
    }

    // Generate unique share ID
    const shareId = generateShareId();

    // Calculate expiration (7 days from now)
    const createdAt = Date.now();
    const expiresAt = createdAt + (7 * 24 * 60 * 60 * 1000); // 7 days

    // Store the share data
    await saveShare(shareId, {
      ticker,
      extractedData,
      result,
      createdAt,
      expiresAt,
    });

    console.log(`[Share] Generated share link: ${shareId} for ticker: ${ticker}`);

    // Get base URL from request or use environment variable
    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    
    if (!baseUrl) {
      // Try to get from Vercel environment
      if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`;
      } else {
        // Try to get from request headers (for local dev)
        const host = req.headers.get('host');
        const protocol = req.headers.get('x-forwarded-proto') || 'http';
        baseUrl = `${protocol}://${host}`;
      }
    }
    
    const shareUrl = `${baseUrl}/share/${shareId}`;

    return NextResponse.json({
      shareId,
      shareUrl,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error: any) {
    console.error('Error generating share link:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate share link' },
      { status: 500 }
    );
  }
}

