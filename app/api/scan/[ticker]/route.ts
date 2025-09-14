import { NextResponse } from 'next/server';

// Force node runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    const tkr = params.ticker.toUpperCase();

    // --- Mock price/volume ---
    const latest = { close: 3.25, volume: 1000000 };
    const avgVol = 500000;
    const sudden_volume_spike = latest.volume > avgVol * 3;
    const sudden_price_spike = false;
    const valuation_fundamentals_mismatch = true;

    // --- Mock SEC ---
    const sec_flags: Array<{ form: string; date: string; reason: string; url?: string }> = [
      {
        form: 'S-3',
        date: '2025-09-01',
        reason: 'Shelf registration (possible dilution)',
        url: 'https://www.sec.gov/Archives/edgar/data/0000000000/filing-s3.htm',
      },
    ];

    // --- Mock hype ---
    const hype = {
      redditMentions: 12,
      twitterMentions: 30,
      timeline: [
        { day: '1d ago', reddit: 2, twitter: 5 },
        { day: '2d ago', reddit: 4, twitter: 10 },
        { day: '3d ago', reddit: 6, twitter: 15 },
      ],
      keywordHeatmap: {
        pump: 3,
        moon: 2,
        telegram: 1,
      },
    };

    // --- Mock squeeze risk ---
    const squeezeRiskScore = 75;
    const squeezeLabel = squeezeRiskScore >= 80 ? '🔥 Extreme'
      : squeezeRiskScore >= 60 ? '⚠️ Elevated'
      : squeezeRiskScore >= 40 ? 'Moderate'
      : 'Low';

    return NextResponse.json({
      ticker: tkr,

      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      reverse_split_or_dilution: true,
      recent_auditor_change: false,
      insider_or_major_holder_selloff: true,

      last_price: latest.close,
      avg_volume: avgVol,
      latest_volume: latest.volume,
      marketCap: 100_000_000,
      sharesOutstanding: 50_000_000,
      floatShares: 40_000_000,

      shortFloat: 25,
      insiderOwn: 5,
      instOwn: 12,
      squeezeRiskScore: Math.min(squeezeRiskScore, 100),
      squeezeLabel,

      history: [
        { date: '2025-09-10', close: 3.0, volume: 400000 },
        { date: '2025-09-11', close: 3.25, volume: 1000000 },
      ],

      sec_flags: sec_flags ?? [], // ✅ always array
      hype: hype ?? {             // ✅ always shaped object
        redditMentions: 0,
        twitterMentions: 0,
        timeline: [],
        keywordHeatmap: {},
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'scan failed' }, { status: 500 });
  }
}
