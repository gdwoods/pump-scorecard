import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

function pctChange(newVal: number, oldVal: number): number {
  if (!oldVal || oldVal === 0) return 0;
  return ((newVal - oldVal) / oldVal) * 100;
}

export async function GET(
  req: Request,
  { params }: { params: { ticker: string } }
) {
  const { ticker } = params;

  try {
    // --- Fundamentals ---
    const quote: any = await yahooFinance.quote(ticker).catch(() => ({}));
    const chart: any = await yahooFinance
      .chart(ticker, { range: "1mo", interval: "1d" })
      .catch(() => ({ quotes: [] }));

    const marketCap = quote.marketCap ?? null;
    const sharesOut = quote.sharesOutstanding ?? null;
    const floatShares = quote.floatShares ?? null;
    const shortFloat = quote.shortPercentOfFloat ?? null;
    const insiderOwn = quote.heldPercentInsiders ?? null;
    const instOwn = quote.heldPercentInstitutions ?? null;

    const prices =
      chart.quotes?.map((q: any) => ({
        date: q.date,
        close: q.close,
        volume: q.volume,
      })) ?? [];

    // --- Criteria ---
    const criteria: Record<string, { triggered: boolean; reason?: string }> = {};

    // Volume spike (last vs avg 10d)
    if (prices.length > 10) {
      const last = prices.at(-1)!;
      const avgVol =
        prices.slice(-11, -1).reduce((a, b) => a + (b.volume || 0), 0) / 10;
      const spike = avgVol ? last.volume / avgVol : 0;
      criteria["suddenVolumeSpike"] = {
        triggered: spike > 3,
        reason: `Vol ${spike.toFixed(1)}x 10d avg`,
      };
    } else {
      criteria["suddenVolumeSpike"] = { triggered: false };
    }

    // Price spike (last vs avg 10d)
    if (prices.length > 10) {
      const last = prices.at(-1)!;
      const avgClose =
        prices.slice(-11, -1).reduce((a, b) => a + (b.close || 0), 0) / 10;
      const move = pctChange(last.close, avgClose);
      criteria["suddenPriceSpike"] = {
        triggered: Math.abs(move) > 30,
        reason: `Move ${move.toFixed(1)}% vs 10d avg`,
      };
    } else {
      criteria["suddenPriceSpike"] = { triggered: false };
    }

    // Valuation mismatch
    criteria["valuationMismatch"] = {
      triggered: !!(marketCap && marketCap > 1e9 && !quote.revenue),
    };

    // SEC placeholders
    criteria["recentAuditorChange"] = { triggered: false };
    criteria["dilutionOrSplit"] = { triggered: false };
    criteria["insiderSelloff"] = { triggered: false };

    // Manual/social placeholders
    [
      "socialMediaPromotion",
      "regulatoryAlerts",
      "guaranteedReturns",
      "whatsappVip",
      "impersonatedAdvisors",
    ].forEach((k) => (criteria[k] = { triggered: false }));

    // --- Score ---
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
    return NextResponse.json({ error: err.message, ticker }, { status: 500 });
  }
}
