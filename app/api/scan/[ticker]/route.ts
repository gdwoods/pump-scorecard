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
    let filings: { title: string; date: string; url: string }[] = [];
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

            // Normalized country
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

    // ---------- Fraud Images ----------
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
          }))
          .filter((img: any) => img.full && img.thumb);
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
      filings,
      promotions,
      fraudImages,
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
