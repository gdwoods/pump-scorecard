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
    // Priority: NEXT_PUBLIC_BASE_URL > Production domain > VERCEL_URL (preview)
    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    
    if (!baseUrl) {
      // Check if we have a custom production domain
      // Vercel custom domains are typically available in production
      if (process.env.VERCEL_ENV === 'production') {
        // Try to get production URL from request headers first (most reliable)
        const host = req.headers.get('host');
        if (host && !host.includes('.vercel.app')) {
          // Custom domain detected
          const protocol = req.headers.get('x-forwarded-proto') || 'https';
          baseUrl = `${protocol}://${host}`;
        } else if (process.env.VERCEL_URL) {
          // Fall back to vercel.app URL (but check if it's production)
          baseUrl = `https://${process.env.VERCEL_URL}`;
        }
      } else {
        // For preview/development, use VERCEL_URL but warn in logs
        if (process.env.VERCEL_URL) {
          baseUrl = `https://${process.env.VERCEL_URL}`;
          console.warn(`[Share] Using preview URL: ${baseUrl} - Preview deployments may require Vercel auth`);
        } else {
          // Local development fallback
          const host = req.headers.get('host');
          const protocol = req.headers.get('x-forwarded-proto') || 'http';
          baseUrl = `${protocol}://${host}`;
        }
      }
    }
    
    const shareUrl = `${baseUrl}/share/${shareId}`;
    console.log(`[Share] Generated URL: ${shareUrl} (env: ${process.env.VERCEL_ENV || 'local'})`);

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

