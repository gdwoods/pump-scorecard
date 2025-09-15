import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

// ✅ Helper: check percentage change
function pctChange(newVal: number, oldVal: number): number {
  return ((newVal - oldVal) / oldVal) * 100;
}

export async function GET(
  req: Request,
  { params }: { params: { ticker: string } }
) {
  const { ticker } = params;

  try {
    // --- Fetch Yahoo Finance data ---
    const quote = await yahooFinance.quote(ticker);
    const chart = await yahooFinance.chart(ticker, {
      range: "1mo",
      interval: "1d",
    });

    const marketCap = quote.marketCap || null;
    const sharesOut = quote.sharesOutstanding || null;
    const floatShares = quote.floatShares || null;
    const shortFloat = quote.shortPercentOfFloat || null;
    const insiderOwn = quote.heldPercentInsiders || null;
    const instOwn = quote.heldPercentInstitutions || null;

    const prices = chart.quotes.map((q: any) => ({
      date: q.date,
      close: q.close,
      volume: q.volume,
    }));

    // --- Criteria checks ---
    const criteria: Record<string, { triggered: boolean; reason?: string }> = {};

    // Sudden volume spike (vs 10-day average)
    if (prices.length > 10) {
      const last = prices[prices.length - 1];
      const avgVol =
        prices.slice(-11, -1).reduce((a: number, b: any) => a + b.volume, 0) /
        10;
      const spike = last.volume / avgVol;
      criteria["suddenVolumeSpike"] = {
        triggered: spike > 3,
        reason: `Volume ${spike.toFixed(1)}x 10d avg`,
      };
    }

    // Sudden price spike (vs 10-day average)
    if (prices.length > 10) {
      const last = prices[prices.length - 1];
      const avgClose =
        prices.slice(-11, -1).reduce((a: number, b: any) => a + b.close, 0) /
        10;
      const move = pctChange(last.close, avgClose);
      criteria["suddenPriceSpike"] = {
        triggered: Math.abs(move) > 30,
        reason: `Price move ${move.toFixed(1)}% vs 10d avg`,
      };
    }

    // Valuation fundamentals mismatch
    criteria["valuationMismatch"] = {
      triggered: marketCap && marketCap > 1e9 && !quote.revenue,
      reason: "Large cap but missing revenue",
    };

    // SEC filings – placeholder (not scraping yet)
    criteria["recentAuditorChange"] = { triggered: false };
    criteria["dilutionOrSplit"] = { triggered: false };
    criteria["insiderSelloff"] = { triggered: false };

    // Manual/social criteria – always false in backend
    criteria["socialMediaPromotion"] = { triggered: false };
    criteria["regulatoryAlerts"] = { triggered: false };
    criteria["guaranteedReturns"] = { triggered: false };
    criteria["whatsappVip"] = { triggered: false };
    criteria["impersonatedAdvisors"] = { triggered: false };

    // --- Score calculation ---
    const triggeredCount = Object.values(criteria).filter((c) => c.triggered)
      .length;
    const score = Math.min(100, triggeredCount * 10);

    return NextResponse.json({
      ticker,
      fundamentals: {
        marketCap,
        sharesOut,
        floatShares,
        shortFloat,
        insiderOwn,
        instOwn,
      },
      prices,
      criteria,
      score,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, ticker },
      { status: 500 }
    );
  }
}
