import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

const RISKY_COUNTRIES = ["China", "Hong Kong", "Malaysia"];
const MANUAL_CRITERIA = {
  impersonated_advisors: false,
  guaranteed_returns: false,
  regulatory_alerts: false,
};

// ✅ SEC headers for cloud deployments (required on Vercel)
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

    // ---------- SEC Filings ----------
    let filings: { title: string; date: string; url: string; description?: string }[] = [];
    let allFilings: typeof filings = [];
    let babyShelfRisk = false;
    let goingConcernDetected = false;
    let secIncorporationCountry: string | null = null;

    function formatDescription(name: string): string {
      return name
        ?.replace(/\.htm$/, "")
        .replace(/[_\-]/g, " ")
        .replace(/\b([a-z])/g, (c) => c.toUpperCase());
    }

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

            // Incorporation country
            if (secJson?.stateOfIncorporationDescription) {
              secIncorporationCountry = secJson.stateOfIncorporationDescription;
            }

            // Recent filings
            const recent = secJson?.filings?.recent;
            if (recent?.form && Array.isArray(recent.form)) {
              allFilings = recent.form.map((form: string, idx: number) => ({
                title: form,
                date: recent.filingDate[idx],
                url: `https://www.sec.gov/Archives/edgar/data/${cik}/${recent.accessionNumber[idx].replace(/-/g, "")}/${recent.primaryDocument[idx]}`,
                description: formatDescription(recent.primaryDocument[idx] || ""),
              }));

              const dilutionForms = ["S-1", "424B", "F-1", "F-3", "F-4", "S-3"];
              filings = allFilings.filter((f) =>
                dilutionForms.some((d) => f.title.toUpperCase().includes(d))
              );

              const float = quote?.floatShares ?? quote?.sharesOutstanding ?? null;
              babyShelfRisk =
                filings.some((f) => f.title.toUpperCase().includes("S-1")) &&
                (typeof float === "number" ? float < 75_000_000 : false);

              goingConcernDetected = allFilings.some(
                (f) =>
                  (f.title === "10-Q" || f.title === "10-K") &&
                  f.description?.toLowerCase().includes("going")
              );

              filings = filings
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 8);

              allFilings = allFilings
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 8);
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
      if (fraudRes.ok) {
        const fraudJson = await fraudRes.json();
        const items = fraudJson.results || fraudJson.data || fraudJson.items || [];
        fraudImages = items.map((img: any) => ({
          full: img.imagePath?.startsWith("http")
            ? img.imagePath
            : `https://eagyqnmtlkoahfqqhgwc.supabase.co/storage/v1/object/public/${img.imagePath}`,
          thumb: img.thumbnailPath
            ? `https://eagyqnmtlkoahfqqhgwc.supabase.co/storage/v1/object/public/${img.thumbnailPath}`
            : null,
          approvedAt: img.approvedAt,
        }));
      }
    } catch (err) {
      console.error("⚠️ Fraud fetch failed:", err);
    }
    const fraudEvidence = fraudImages.length > 0;

    // ---------- Country ----------
    let country = "Unknown";
    let countrySource = "Unknown";
    if (secIncorporationCountry) {
      country = secIncorporationCountry;
      countrySource = "SEC";
    } else if (quote?.country) {
      country = quote.country;
      countrySource = "Yahoo";
    }

    const riskyCountry = RISKY_COUNTRIES.includes(country);

    // ---------- Auto Criteria ----------
    const sudden_volume_spike =
      !!latest.volume && avgVol > 0 && latest.volume > avgVol * 3;
    const sudden_price_spike =
      latest.close > (prev.close || latest.close) * 1.25 ||
      latest.close > (minClose || latest.close) * 2;
    const valuation_fundamentals_mismatch =
      !quote.trailingPE || quote.trailingPE > 100;
    const reverse_split = filings.some((f: any) =>
      (f.title || "").toLowerCase().includes("split")
    );
    const dividend_announced = filings.some((f: any) =>
      (f.title || "").toLowerCase().includes("dividend")
    );
    const promoted_stock = promotions.length > 0;
    const dilution_or_offering = filings.length > 0;

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

    const reasons: string[] = [];
    if (reverse_split) reasons.push("a reverse split");
    if (promoted_stock) reasons.push("active stock promotions");
    if (dilution_or_offering) reasons.push("a recent dilution filing");
    if (riskyCountry) reasons.push(`incorporation in ${country}`);
    if (fraudEvidence) reasons.push("fraud evidence posted online");

    let summaryText = "";
    if (summaryVerdict === "Low risk") {
      summaryText = "This one looks pretty clean — no major pump-and-dump signals right now.";
    } else if (summaryVerdict === "Moderate risk") {
      summaryText = `Worth keeping an eye on. I spotted ${reasons.join(", ")}. Not screaming pump yet, but caution is warranted.`;
    } else {
      summaryText = `This stock is lighting up the board — ${reasons.join(", ")} make it look like a prime pump-and-dump candidate.`;
    }

    // ---------- Respond ----------
    return NextResponse.json({
      ticker,
      companyName: quote.longName || quote.shortName || ticker,

      // criteria
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      reverse_split,
      dividend_announced,
      promoted_stock,
      dilution_or_offering,
      riskyCountry,
      fraudEvidence,

      ...MANUAL_CRITERIA,

      // fundamentals
      last_price: latest.close || null,
      avg_volume: avgVol || null,
      latest_volume: latest.volume || null,
      marketCap: quote.marketCap || null,
      sharesOutstanding: quote.sharesOutstanding || null,
      floatShares: quote.floatShares ?? quote.sharesOutstanding ?? null,
      shortFloat: (quote as any)?.shortRatio || null,
      insiderOwn: (quote as any)?.insiderHoldPercent || null,
      instOwn: (quote as any)?.institutionalHoldPercent || null,

      // meta
      exchange: quote.fullExchangeName || "Unknown",
      country,
      countrySource,

      // data
      history,
      promotions,
      filings,
      allFilings,
      fraudImages,

      // scores
      flatRiskScore,
      weightedRiskScore: weightedScore,

      // summary
      summaryVerdict,
      summaryText,

      // extras
      babyShelfRisk,
      goingConcernDetected,
    });
  } catch (err: any) {
    console.error("❌ Fatal route error:", err);
    return NextResponse.json({
      error: err.message || "scan failed",
      ...MANUAL_CRITERIA,
    });
  }
}
