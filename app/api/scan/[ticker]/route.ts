// app/api/scan/[ticker]/route.ts
import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";
import { parseSecAddress } from "@/utils/normalizeCountry";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const upperTicker = ticker.toUpperCase();

  try {
    // ---------- Yahoo Finance ----------
    let quote: any = {};
    let history: any[] = [];
    try {
      quote = await yahooFinance.quote(upperTicker);
      const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 180;
      const chart = await yahooFinance.chart(upperTicker, {
        period1: new Date(Date.now() - SIX_MONTHS_MS),
        period2: new Date(),
        interval: "1d",
      });
      history =
        chart.quotes?.map((q: any) => ({
          date: q.date?.toISOString().split("T")[0] || "",
          close: q.close,
          volume: q.volume,
        })) || [];
    } catch (err) {
      console.error("⚠️ Yahoo fetch failed:", err);
    }

    // ---------- Polygon Meta ----------
    let polyMeta: any = {};
    try {
      const polygonKey = process.env.POLYGON_API_KEY;
      if (polygonKey) {
        const polyRes = await fetch(
          `https://api.polygon.io/v3/reference/tickers/${upperTicker}?apiKey=${polygonKey}`
        );
        if (polyRes.ok) polyMeta = await polyRes.json();
      }
    } catch (err) {
      console.error("⚠️ Polygon meta failed:", err);
    }

    // ---------- SEC Filings ----------
    let filings: any[] = [];
    let secCountry: string | null = null;
    try {
      const cikRes = await fetch("https://www.sec.gov/files/company_tickers.json", {
        headers: {
          "User-Agent": "pump-scorecard (garthwoods@gmail.com)",
          Accept: "application/json",
        },
      });
      if (cikRes.ok) {
        const cikJson = await cikRes.json();
        const entry = Object.values(cikJson).find(
          (c: any) => c.ticker.toUpperCase() === upperTicker
        );
        if (entry) {
          const cik = entry.cik_str.toString().padStart(10, "0");
          const secRes = await fetch(
            `https://data.sec.gov/submissions/CIK${cik}.json`,
            {
              headers: {
                "User-Agent": "pump-scorecard (garthwoods@gmail.com)",
                Accept: "application/json",
              },
            }
          );
          if (secRes.ok) {
            const secJson = await secRes.json();
            const biz = parseSecAddress(secJson?.addresses?.business);
            const mail = parseSecAddress(secJson?.addresses?.mailing);

            console.log("📢 SEC business address (normalized):", biz);

            if (biz?.country && biz.country !== "Unknown") {
              secCountry = biz.country;
            }

            const recent = secJson?.filings?.recent;
            if (recent?.form && Array.isArray(recent.form)) {
              filings = recent.form.map((form: string, idx: number) => ({
                title: form || "Untitled Filing",
                date: recent.filingDate[idx] || "Unknown",
                url: `https://www.sec.gov/Archives/edgar/data/${cik}/${recent.accessionNumber[idx].replace(
                  /-/g,
                  ""
                )}/${recent.primaryDocument[idx]}`,
                businessAddress: biz,
                mailingAddress: mail,
              }));
              filings = filings
                .sort(
                  (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                )
                .slice(0, 8);
            }
          }
        }
      }
    } catch (err) {
      console.error("⚠️ SEC fetch failed:", err);
    }

    // ---------- Promotions ----------
    let promotions: { type: string; date: string; url: string }[] = [];
    try {
      const promoRes = await fetch(
        `https://www.stockpromotiontracker.com/api/stock-promotions?ticker=${upperTicker}&dateRange=all&limit=10&offset=0&sortBy=promotion_date&sortDirection=desc`
      );
      if (promoRes.ok) {
        const promoJson = await promoRes.json();
        const rawPromos = promoJson?.results || [];
        promotions = rawPromos.map((p: any) => ({
          type: p.type || "Promotion",
          date: p.promotion_date || "",
          url: "https://www.stockpromotiontracker.com/",
        }));
      }
    } catch (err) {
      console.error("⚠️ Promotions fetch failed:", err);
    }

    if (!promotions || promotions.length === 0) {
      promotions = [
        {
          type: "Manual Check",
          date: "",
          url: "https://www.stockpromotiontracker.com/",
        },
      ];
    }

    // ---------- Fraud Images (strict filter) ----------
    let fraudImages: any[] = [];
    try {
      const fraudRes = await fetch(
        `https://www.stopnasdaqchinafraud.com/api/stop-nasdaq-fraud?page=0&searchText=${upperTicker}`,
        { headers: { "User-Agent": "pump-scorecard" } }
      );
      if (fraudRes.ok) {
        const fraudJson = await fraudRes.json();
        const rawResults = fraudJson?.results || [];
        fraudImages = rawResults
          .map((img: any) => ({
            full: img.imagePath
              ? `https://eagyqnmtlkoahfqqhgwc.supabase.co/storage/v1/object/public/${img.imagePath}`
              : null,
            thumb: img.thumbnailPath
              ? `https://eagyqnmtlkoahfqqhgwc.supabase.co/storage/v1/object/public/${img.thumbnailPath}`
              : null,
            approvedAt: img.approvedAt || null,
            ticker: img.ticker || null,
          }))
          .filter(
            (img: any) =>
              img.full &&
              img.thumb &&
              (
                (img.ticker && img.ticker.toUpperCase() === upperTicker) ||
                img.full.toUpperCase().includes(upperTicker) ||
                img.thumb.toUpperCase().includes(upperTicker)
              )
          );
      }
    } catch (err) {
      console.error("⚠️ Fraud fetch failed:", err);
    }

    if (!fraudImages || fraudImages.length === 0) {
      fraudImages = [
        {
          full: null,
          thumb: null,
          approvedAt: null,
          type: "Manual Check",
          url: "https://www.stopnasdaqchinafraud.com/",
        },
      ];
    }

    // ---------- Droppiness (Polygon 1m → 4h aggregation, 20% threshold, 24 months) ----------
    let droppinessScore: number = 0;
    let droppinessDetail: any[] = [];
    let intraday: any[] = [];
    try {
      const TWENTYFOUR_MONTHS_MS = 1000 * 60 * 60 * 24 * 730;
      const startDate = new Date(Date.now() - TWENTYFOUR_MONTHS_MS);
      const endDate = new Date();
      const startDateStr = startDate.toISOString().slice(0, 10);
      const endDateStr = endDate.toISOString().slice(0, 10);

      let oneMinBars: any[] = [];
      try {
        const polygonKey = process.env.POLYGON_API_KEY;
        if (polygonKey) {
          let url: string | null = `https://api.polygon.io/v2/aggs/ticker/${upperTicker}/range/1/minute/${startDateStr}/${endDateStr}?limit=50000&apiKey=${polygonKey}`;

          while (url) {
            const res = await fetch(url);
            if (!res.ok) {
              console.error("⚠️ Polygon fetch failed:", await res.text());
              break;
            }
            const json = await res.json();

            if (json.results?.length) {
              oneMinBars.push(
                ...json.results.map((c: any) => ({
                  date: new Date(c.t),
                  open: c.o,
                  high: c.h,
                  low: c.l,
                  close: c.c,
                  volume: c.v,
                }))
              );
            }

            if (json.next_url) {
              const next = new URL(json.next_url);
              if (!next.searchParams.has("apiKey")) {
                next.searchParams.set("apiKey", polygonKey);
              }
              url = next.toString();
            } else {
              url = null;
            }
          }

          if (oneMinBars.length > 0) {
            console.log(
              `📊 Polygon returned ${oneMinBars.length} 1m candles, range ${oneMinBars[0]?.date} → ${oneMinBars.at(-1)?.date}`
            );
          }
        } else {
          console.error("⚠️ POLYGON_API_KEY not set in environment");
        }
      } catch (err) {
        console.error("⚠️ Polygon 1m fetch failed:", err);
      }

      // Aggregate 1m → 4h
      let candles: any[] = [];
      if (oneMinBars.length > 0) {
        const bucketMs = 1000 * 60 * 60 * 4;
        let bucket: any = null;

        for (const bar of oneMinBars) {
          const bucketTime = Math.floor(bar.date.getTime() / bucketMs) * bucketMs;

          if (!bucket || bucket.bucketTime !== bucketTime) {
            if (bucket) candles.push(bucket);
            bucket = {
              bucketTime,
              date: new Date(bucketTime),
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
              volume: bar.volume,
            };
          } else {
            bucket.high = Math.max(bucket.high, bar.high);
            bucket.low = Math.min(bucket.low, bar.low);
            bucket.close = bar.close;
            bucket.volume += bar.volume;
          }
        }
        if (bucket) candles.push(bucket);
        console.log(`🕒 Aggregated into ${candles.length} 4h candles`);
      }

      intraday = candles;

      // Detect spikes
      let spikeCount = 0;
      let retraceCount = 0;

      for (let i = 1; i < candles.length; i++) {
        const prev = candles[i - 1];
        const cur = candles[i];
        if (!prev.close || !cur.close || !cur.high) continue;

        const spikePct = (cur.high - prev.close) / prev.close;
        if (spikePct > 0.20) {
          spikeCount++;
          let retraced = false;

          if ((cur.high - cur.close) / cur.high > 0.10) retraced = true;
          if (!retraced && candles[i + 1] && candles[i + 1].close < cur.close * 0.90) {
            retraced = true;
          }

          if (retraced) retraceCount++;

          droppinessDetail.push({
            date: cur.date?.toISOString() || "",
            spikePct: +(spikePct * 100).toFixed(1),
            retraced,
          });

          console.log(
            `⚡ Spike detected: ${cur.date} | ${(spikePct * 100).toFixed(1)}% | retraced=${retraced}`
          );
        }
      }

      droppinessScore = spikeCount > 0 ? Math.round((retraceCount / spikeCount) * 100) : 0;
      if (spikeCount === 0) {
        console.log("ℹ️ No qualifying spikes found (>20%) in 24 months");
      }
    } catch (err) {
      console.error("⚠️ Droppiness calc failed:", err);
    }

    // ---------- Scores ----------
    const latest = history.at(-1) || {};
    const prev = history.at(-2) || latest;
    const avgVol =
      history.reduce((s, q) => s + (q.volume || 0), 0) /
        (history.length || 1) || 0;
    const sudden_volume_spike =
      !!latest.volume && avgVol > 0 && latest.volume > avgVol * 3;
    const sudden_price_spike =
      latest.close > (prev.close || latest.close) * 1.25;

    let weightedScore = 0;
    if (sudden_volume_spike) weightedScore += 20;
    if (sudden_price_spike) weightedScore += 20;
    if (filings.some((f) => f.title.includes("S-1") || f.title.includes("424B")))
      weightedScore += 20;
    if (fraudImages.length > 0 && !fraudImages[0].type) weightedScore += 20;

    if (droppinessScore !== null) {
      if (droppinessScore >= 70) weightedScore -= 15;
      else if (droppinessScore < 40) weightedScore += 15;
    }

    if (weightedScore < 0) weightedScore = 0;

    let summaryVerdict = "Low risk";
    if (weightedScore >= 70) summaryVerdict = "High risk";
    else if (weightedScore >= 40) summaryVerdict = "Moderate risk";

    const summaryText =
      summaryVerdict === "Low risk"
        ? "This one looks pretty clean — no major pump-and-dump signals right now."
        : summaryVerdict === "Moderate risk"
        ? "Worth keeping an eye on. Not screaming pump yet, but caution is warranted."
        : "This stock is lighting up the board — multiple risk signals make it look like a prime pump-and-dump candidate.";

    // ---------- Country selection ----------
    let country = "Unknown";
    let countrySource = "Unknown";

    if (secCountry) {
      country = secCountry.trim();
      countrySource = "SEC";
    } else if (polyMeta?.results?.country) {
      country = polyMeta.results.country.trim();
      countrySource = "Polygon";
    } else if (polyMeta?.results?.locale) {
      country =
        polyMeta.results.locale.toUpperCase() === "US"
          ? "United States"
          : polyMeta.results.locale.trim();
      countrySource = "Polygon";
    } else if (quote.country) {
      country = quote.country.trim();
      countrySource = "Yahoo";
    }

    return NextResponse.json({
      ticker: upperTicker,
      companyName: quote.longName || quote.shortName || upperTicker,
      marketCap: quote.marketCap || null,
      sharesOutstanding: quote.sharesOutstanding || null,
      floatShares: quote.floatShares ?? quote.sharesOutstanding ?? null,
      shortFloat: (quote as any)?.shortRatio || null,
      insiderOwnership: (quote as any)?.insiderHoldPercent || null,
      institutionalOwnership: (quote as any)?.institutionalHoldPercent || null,
      exchange: quote.fullExchangeName || "Unknown",
      country,
      countrySource,
      history,
      intraday,
      filings,
      promotions,
      fraudImages,
      droppinessScore,
      droppinessDetail,
      weightedRiskScore: weightedScore,
      summaryVerdict,
      summaryText,
    });
  } catch (err: any) {
    console.error("❌ Fatal route error:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
