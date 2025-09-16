import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

const RISKY_COUNTRIES = ["China", "Hong Kong", "Malaysia"];
const MANUAL_CRITERIA = {
  impersonated_advisors: false,
  guaranteed_returns: false,
  regulatory_alerts: false,
};

const SEC_HEADERS = {
  "User-Agent": "pump-scorecard (contact: your@email.com)",
  Accept: "application/json",
  "Accept-Encoding": "gzip, deflate",
};

export async function GET(req: Request) {
  try {
    const { pathname } = new URL(req.url);
    const ticker = (pathname.split("/").pop() || "").toUpperCase();

    // ---------- Yahoo Finance ----------
    let quote: any = {};
    let history: any[] = [];
    try {
      quote = await yahooFinance.quote(ticker);
      const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 180;
      const chart = await yahooFinance.chart(ticker, {
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

    const latest = history.at(-1) || {};
    const prev = history.at(-2) || latest;
    const avgVol =
      history.reduce((s, q) => s + (q.volume || 0), 0) /
        (history.length || 1) || 0;
    const minClose = history.length ? Math.min(...history.map((q) => q.close)) : 0;

    // ---------- Polygon Meta (restore this!) ----------
    let polyMeta: any = {};
    try {
      const polyRes = await fetch(
        `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${process.env.POLYGON_KEY}`
      );
      if (!polyRes.ok) {
        console.error("⚠️ Polygon fetch failed:", polyRes.status, await polyRes.text());
      } else {
        polyMeta = await polyRes.json();
      }
    } catch (err) {
      console.error("⚠️ Polygon meta failed:", err);
    }

    // ---------- Promotions ----------
    let promotions: any[] = [];
    try {
      const promoRes = await fetch(
        `https://www.stockpromotiontracker.com/api/stock-promotions?ticker=${ticker}&dateRange=all&limit=10&offset=0&sortBy=promotion_date&sortDirection=desc`
      );
      if (!promoRes.ok) {
        console.error("⚠️ Promotions fetch failed:", promoRes.status, await promoRes.text());
      } else {
        const promoJson = await promoRes.json();
        promotions = promoJson.results || [];
      }
    } catch (err) {
      console.error("⚠️ Promotions fetch failed:", err);
    }

    // ---------- SEC Filings ----------
    let filings: any[] = [];
    try {
      const cikRes = await fetch("https://www.sec.gov/files/company_tickers.json", {
        headers: SEC_HEADERS,
      });
      if (!cikRes.ok) {
        console.error("⚠️ SEC ticker lookup failed:", cikRes.status);
      } else {
        const cikJson = await cikRes.json();
        const entry = Object.values(cikJson).find(
          (c: any) => c.ticker.toUpperCase() === ticker
        );
        if (entry) {
          const cik = entry.cik_str.toString().padStart(10, "0");
          const secRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
            headers: SEC_HEADERS,
          });
          if (!secRes.ok) {
            console.error("⚠️ SEC submissions fetch failed:", secRes.status, await secRes.text());
          } else {
            const secJson = await secRes.json();
            if (secJson?.filings?.recent?.form) {
              filings = secJson.filings.recent.form.map((form: any, idx: number) => ({
                form,
                filingDate: secJson.filings.recent.filingDate[idx],
                url: `https://www.sec.gov/Archives/edgar/data/${cik}/${secJson.filings.recent.accessionNumber[idx].replace(/-/g, "")}/${secJson.filings.recent.primaryDocument[idx]}`,
              }));
            }
          }
        }
      }
    } catch (err) {
      console.error("⚠️ SEC fetch failed:", err);
    }

    // ---------- Fraud Images ----------
    let fraudImages: any[] = [];
    try {
      const fraudRes = await fetch(
        `https://www.stopnasdaqchinafraud.com/api/stop-nasdaq-fraud?page=0&searchText=${ticker}`
      );
      if (!fraudRes.ok) {
        console.error("⚠️ Fraud fetch failed:", fraudRes.status, await fraudRes.text());
      } else {
        const fraudJson = await fraudRes.json();
        fraudImages = (fraudJson.results || []).map((img: any) => ({
          full: `https://eagyqnmtlkoahfqqhgwc.supabase.co/storage/v1/object/public/${img.imagePath}`,
          thumb: `https://eagyqnmtlkoahfqqhgwc.supabase.co/storage/v1/object/public/${img.thumbnailPath}`,
          approvedAt: img.approvedAt,
        }));
      }
    } catch (err) {
      console.error("⚠️ Fraud fetch failed:", err);
    }
    const fraudEvidence = fraudImages.length > 0;

    // ---------- Auto Criteria ----------
    const sudden_volume_spike =
      !!latest.volume && avgVol > 0 && latest.volume > avgVol * 3;
    const sudden_price_spike =
      latest.close > (prev.close || latest.close) * 1.25 ||
      latest.close > (minClose || latest.close) * 2;
    const valuation_fundamentals_mismatch =
      !quote.trailingPE || quote.trailingPE > 100;
    const reverse_split = filings.some((f: any) =>
      (f.form || "").toLowerCase().includes("split")
    );
    const dividend_announced = filings.some((f: any) =>
      (f.form || "").toLowerCase().includes("dividend")
    );
    const promoted_stock = promotions.length > 0;
    const dilution_or_offering = filings.some((f: any) =>
      (f.form || "").includes("S-1") ||
      (f.form || "").includes("424B")
    );

    const riskyCountry =
      RISKY_COUNTRIES.includes(
        polyMeta?.results?.locale || quote?.country || "Unknown"
      );

    const flatCriteria = [
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      reverse_split,
      dividend_announced,
      promoted_stock,
      dilution_or_offering,
      riskyCountry,
      fraudEvidence,
    ].filter(Boolean).length;

    const flatRiskScore = Math.round((flatCriteria / 9) * 100);

    let weightedScore = flatRiskScore;
    if (promoted_stock) weightedScore += 20;
    if (riskyCountry) weightedScore += 20;
    if (dilution_or_offering) weightedScore += 10;
    if (fraudEvidence) weightedScore += 20;
    if (weightedScore > 100) weightedScore = 100;

    let summaryVerdict = "Low risk";
    if (weightedScore >= 70) summaryVerdict = "High risk";
    else if (weightedScore >= 40) summaryVerdict = "Moderate risk";

    return NextResponse.json({
      ticker,
      companyName: quote.longName || quote.shortName || ticker,
      filings,
      promotions,
      fraudImages,
      last_price: latest.close || null,
      avg_volume: avgVol || null,
      marketCap: quote.marketCap || null,
      sharesOutstanding: quote.sharesOutstanding || null,
      floatShares: quote.floatShares ?? quote.sharesOutstanding ?? null,
      exchange:
        polyMeta?.results?.primary_exchange ||
        quote.fullExchangeName ||
        "Unknown",
      country:
        polyMeta?.results?.locale ||
        quote?.country ||
        "Unknown",
      countrySource: polyMeta?.results?.locale ? "Polygon" : quote?.country ? "Yahoo" : "Unknown",
      flatRiskScore,
      weightedRiskScore: weightedScore,
      summaryVerdict,
    });
  } catch (err: any) {
    console.error("❌ Fatal route error:", err);
    return NextResponse.json({ error: err.message || "scan failed" });
  }
}
