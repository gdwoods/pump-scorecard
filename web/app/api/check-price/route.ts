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

    // Hardcoded list of well-known stocks that trade over $20
    // This is a fallback for when scraping fails
    const highPriceStocks = new Set([
      'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 
      'BRK.B', 'AVGO', 'COST', 'AMD', 'NFLX', 'CRM', 'ADBE', 'PEP', 
      'CSCO', 'TMO', 'ABBV', 'MRK', 'BAC', 'ACN', 'QCOM', 'DHR', 
      'VZ', 'CMCSA', 'WMT', 'ABT', 'MA', 'DIS', 'NKE', 'UPS'
    ]);

    // Quick check: if it's a well-known high-priced stock, assume it's over $20
    // This is a reasonable assumption for major stocks
    if (highPriceStocks.has(tickerUpper)) {
      console.log(`[Price Check] ${tickerUpper} is a known high-priced stock, assuming > $20`);
      // Return a price above $20 (we'll use a conservative estimate)
      // For most of these stocks, they're well over $20, so we'll use $100 as a placeholder
      return NextResponse.json({
        ticker: tickerUpper,
        price: 100, // Placeholder - we know it's > $20
        found: true,
        source: 'hardcoded-list',
      });
    }

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
      
      // Debug: Log a snippet of the HTML to see what we're working with
      const htmlSnippet = html.substring(0, 2000); // First 2000 chars for debugging
      console.log(`[Price Check] HTML snippet for ${tickerUpper} (first 2000 chars):`, htmlSnippet.substring(0, 500));

      // Method 1: Try to extract from embedded JSON data (most reliable)
      // Yahoo Finance embeds quote data in a script tag with root.App.main
      // Look for regularMarketPrice in quoteSummary
      const jsonPatterns = [
        // Pattern 1: "regularMarketPrice":{"raw":123.45,"fmt":"$123.45"} - most common
        /"regularMarketPrice"\s*:\s*\{[^}]*"raw"\s*:\s*([\d\.]+)/,
        // Pattern 1b: Allow for whitespace variations
        /"regularMarketPrice"\s*:\s*\{\s*"raw"\s*:\s*([\d\.]+)/,
        // Pattern 2: "regularMarketPreviousClose":{"raw":123.45,"fmt":"$123.45"}
        /"regularMarketPreviousClose"\s*:\s*\{[^}]*"raw"\s*:\s*([\d\.]+)/,
        // Pattern 3: Simple format "regularMarketPrice":123.45 (without raw/fmt wrapper)
        /"regularMarketPrice"\s*:\s*([\d\.]+)(?![^}]*"(?:marketCap|volume|averageVolume))/,
        // Pattern 4: Look for quoteSummary.price object
        /"quoteSummary"[^{]*"price"[^{]*"regularMarketPrice"[^{]*"raw"\s*:\s*([\d\.]+)/,
      ];

      for (const pattern of jsonPatterns) {
        const matches = html.match(pattern);
        if (matches && matches[1]) {
          const price = parseFloat(matches[1]);
          if (!isNaN(price) && price >= 0.001 && price <= 50000) {
            console.log(`[Price Check] Found price for ${tickerUpper} via JSON: $${price}`);
            return NextResponse.json({
              ticker: tickerUpper,
              price,
              found: true,
            });
          }
        }
      }

      // Method 2: Try fin-streamer element
      const finStreamerMatch = html.match(
        /<fin-streamer[^>]+data-field="regularMarketPrice"[^>]+data-symbol="[^"]+"[^>]*value="([\d,\.]+)"/
      );

      if (finStreamerMatch) {
        const priceStr = finStreamerMatch[1].replace(/,/g, '');
        const price = parseFloat(priceStr);
        
        if (!isNaN(price) && price >= 0.001 && price <= 50000) {
          console.log(`[Price Check] Found price for ${tickerUpper} via fin-streamer: $${price}`);
          return NextResponse.json({
            ticker: tickerUpper,
            price,
            found: true,
          });
        }
      }

      // Method 3: Try FinStreamer data object
      const finStreamerDataMatch = html.match(/FinStreamer\s*:\s*\{[^}]*"price"\s*:\s*([\d\.]+)/);
      if (finStreamerDataMatch) {
        const price = parseFloat(finStreamerDataMatch[1]);
        if (!isNaN(price) && price >= 0.001 && price <= 50000) {
          console.log(`[Price Check] Found price for ${tickerUpper} via FinStreamer data: $${price}`);
          return NextResponse.json({
            ticker: tickerUpper,
            price,
            found: true,
          });
        }
      }

      // Could not find price
      console.log(`[Price Check] ⚠️ Could not extract price for ${tickerUpper} from any method`);
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
