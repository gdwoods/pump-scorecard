import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * API endpoint to check current stock price from Yahoo Finance
 * Used to warn users when adding tickers > $20 to watchlist
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker');

    if (!ticker || !ticker.trim()) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      );
    }

    const tickerUpper = ticker.trim().toUpperCase();

    // Fetch from Yahoo Finance
    const url = `https://finance.yahoo.com/quote/${tickerUpper}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        // Add a timeout
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      // Try to extract price from fin-streamer element (most reliable)
      const finStreamerMatch = html.match(
        /<fin-streamer[^>]+data-field="regularMarketPrice"[^>]+data-symbol="[^"]+"[^>]*value="([\d,\.]+)"/
      );

      if (finStreamerMatch) {
        const priceStr = finStreamerMatch[1].replace(/,/g, '');
        const price = parseFloat(priceStr);
        
        if (!isNaN(price) && price >= 0.001 && price <= 50000) {
          return NextResponse.json({
            ticker: tickerUpper,
            price,
            found: true,
          });
        }
      }

      // Fallback: Try to extract from JSON data in page
      const jsonPriceMatch = html.match(
        /"regularMarketPrice"\s*:\s*\{[^{}]{0,200}"raw"\s*:\s*([\d\.]+)/
      );

      if (jsonPriceMatch) {
        const price = parseFloat(jsonPriceMatch[1]);
        
        if (!isNaN(price) && price >= 0.001 && price <= 1000) {
          return NextResponse.json({
            ticker: tickerUpper,
            price,
            found: true,
          });
        }
      }

      // Could not find price
      return NextResponse.json({
        ticker: tickerUpper,
        price: null,
        found: false,
      });

    } catch (fetchError) {
      console.error(`[Price Check] Error fetching price for ${tickerUpper}:`, fetchError);
      
      // Return null price rather than error - ticker might be invalid or unavailable
      return NextResponse.json({
        ticker: tickerUpper,
        price: null,
        found: false,
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
      });
    }

  } catch (error) {
    console.error('[Price Check] API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
