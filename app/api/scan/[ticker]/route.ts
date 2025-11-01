// app/api/scan/[ticker]/route.ts
import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";
import { parseSecAddress } from "@/utils/normalizeCountry";
import { fetchBorrowDesk } from "@/utils/fetchBorrowDesk";
import * as cheerio from "cheerio";
export const runtime = "nodejs";

type HistoryPoint = { date: string; close: number; volume: number };
type Filing = {
  title: string;
  date: string;
  url: string;
  businessAddress?: any;
  mailingAddress?: any;
};
type Promotion = { type: string; date: string; url: string };
type FraudImage = {
  full: string | null;
  thumb: string | null;
  date: string | null; // normalized ISO
  caption: string;
  sourceUrl: string | null;
};
type IntradayCandle = {
  bucketTime: number;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
type CompanyProfile = {
  sector?: string;
  industry?: string;
  employees?: number;
  website?: string;
  summary?: string;
};

// ---------- iBorrowDesk scraper ----------
async function fetchBorrowData(ticker: string) {
  try {
    const url = `https://www.iborrowdesk.com/report/${ticker}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "pump-scorecard (garthwoods@gmail.com)" },
    });
    if (!res.ok) {
      return { fee: "Manual Check", available: "Manual Check", updated: "N/A", source: url };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const firstRow = $("#report-table tbody tr").first();
    if (!firstRow || firstRow.length === 0) {
      return { fee: "Manual Check", available: "Manual Check", updated: "N/A", source: url };
    }

    const fee = firstRow.find("td").eq(1).text().trim() || "N/A";
    const available = firstRow.find("td").eq(2).text().trim() || "N/A";
    const updated = firstRow.find("td").eq(4).text().trim() || "N/A";

    return { fee, available, updated, source: url };
  } catch (err) {
    console.error("BorrowDesk scrape failed:", err);
    return {
      fee: "Manual Check",
      available: "Manual Check",
      updated: "N/A",
      source: `https://www.iborrowdesk.com/report/${ticker}`,
    };
  }
}

export async function GET(
  req: Request,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const upperTicker = ticker.toUpperCase();

  try {
    // ---------- Yahoo Finance ----------
    let quote: any = {};
    let history: HistoryPoint[] = [];
    let shortFloat: number | null = null;
    let insiderOwnership: number | null = null;
    let institutionalOwnership: number | null = null;
    let companyProfile: CompanyProfile | null = null;

    const toPercent = (raw: any): number | null => {
      const n = Number(raw);
      if (!isFinite(n) || n < 0) return null;
      if (n <= 1.5) return +(n * 100).toFixed(1);
      if (n <= 100) return +n.toFixed(1);
      if (n <= 10000) return +(n / 100).toFixed(1);
      return 100.0;
    };

    try {
      quote = await yahooFinance.quote(upperTicker);
      shortFloat = (quote as any)?.shortPercentFloat ?? null;
      insiderOwnership = (quote as any)?.heldPercentInsiders ?? null;
      institutionalOwnership = (quote as any)?.heldPercentInstitutions ?? null;

      try {
        const summary = await yahooFinance.quoteSummary(upperTicker, {
          modules: [
            "defaultKeyStatistics",
            "insiderHolders",
            "institutionOwnership",
            "majorHoldersBreakdown",
          ],
        });

        const stats = summary?.defaultKeyStatistics || {};
        const insiders = summary?.insiderHolders || {};
        const institutions = summary?.institutionOwnership || {};
        const holders = summary?.majorHoldersBreakdown || {};

        if (shortFloat == null && stats.shortPercentOfFloat != null) {
          shortFloat = stats.shortPercentOfFloat;
        }
        if (insiderOwnership == null && Array.isArray((insiders as any).ownershipList)) {
          insiderOwnership = (insiders as any).ownershipList[0]?.percentHeld ?? null;
        }
        if (institutionalOwnership == null && Array.isArray((institutions as any).ownershipList)) {
          institutionalOwnership = (institutions as any).ownershipList[0]?.percentHeld ?? null;
        }
        if (insiderOwnership == null && holders.insidersPercentHeld != null) {
          insiderOwnership = holders.insidersPercentHeld;
        }
        if (institutionalOwnership == null && holders.institutionsPercentHeld != null) {
          institutionalOwnership = holders.institutionsPercentHeld;
        }
      } catch {}

      // ---------- Company Profile ----------
      try {
        const profileSummary = await yahooFinance.quoteSummary(upperTicker, {
          modules: ["summaryProfile"],
          lang: "en",
        });

        if (profileSummary?.summaryProfile) {
          companyProfile = {
            sector: profileSummary.summaryProfile.sector || null,
            industry: profileSummary.summaryProfile.industry || null,
            employees: profileSummary.summaryProfile.fullTimeEmployees || null,
            website: profileSummary.summaryProfile.website || null,
            summary: profileSummary.summaryProfile.longBusinessSummary || null,
          };
        }
      } catch (err) {
        console.error("Company profile fetch failed:", err);
      }

      const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 180;
      const chart = await yahooFinance.chart(upperTicker, {
        period1: new Date(Date.now() - SIX_MONTHS_MS),
        period2: new Date(),
        interval: "1d",
      });
      history =
        chart.quotes?.map((q: any) => ({
          date: q.date?.toISOString().split("T")[0] || "",
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.close,
          volume: q.volume,
        })) || [];
    } catch {}
// ---------- Splits & 52-week High/Low ----------
let splits: { date: string; ratio: string }[] = [];
let high52Week: number | null = null;
let low52Week: number | null = null;

try {
  // 52-week high/low
  const TWO_YEARS = 1000 * 60 * 60 * 24 * 730;
  const chartHist = await yahooFinance.chart(upperTicker, {
    period1: new Date(Date.now() - TWO_YEARS),
    period2: new Date(),
    interval: "1d",
  });

  const closes = chartHist.quotes?.map((q: any) => q.close).filter(Boolean) || [];
  if (closes.length > 0) {
    const lastYear = closes.slice(-252); // ~1 year of trading days
    high52Week = Math.max(...lastYear);
    low52Week = Math.min(...lastYear);
  }

  // ✅ Polygon splits (query param, not path param)
  const polygonKey = process.env.POLYGON_API_KEY;
  if (polygonKey) {
    let url: string | null = `https://api.polygon.io/v3/reference/splits?ticker=${upperTicker}&apiKey=${polygonKey}`;
    let allSplits: any[] = [];

    while (url) {
      const splitRes = await fetch(url);
      if (!splitRes.ok) break;
      const splitJson = await splitRes.json();
      allSplits.push(...(splitJson.results || []));
      url = splitJson.next_url ? `${splitJson.next_url}&apiKey=${polygonKey}` : null;
    }

    const THREE_YEARS = 1000 * 60 * 60 * 24 * 365 * 3;
    splits = allSplits
      .map((s: any) => ({
        date: s.execution_date,
        ratio: `${s.split_to}-for-${s.split_from}`,
      }))
      .filter((s) => new Date(s.date).getTime() > Date.now() - THREE_YEARS);
  }
} catch (err) {
  console.error("Splits/52-week fetch failed:", err);
}

// ---------- Polygon Meta ----------
let polyMeta: any = {};
let hasOptions = false; // define once here — do NOT redeclare later

try {
  const polygonKey = process.env.POLYGON_API_KEY;

  if (polygonKey) {
    // ✅ Fetch base ticker meta
    const metaRes = await fetch(
      `https://api.polygon.io/v3/reference/tickers/${upperTicker}?apiKey=${polygonKey}`
    );
    if (metaRes.ok) polyMeta = await metaRes.json();

    // ✅ Check for options availability (Polygon paid endpoint)
    const optRes = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?ticker=${upperTicker}&limit=1&apiKey=${polygonKey}`
    );
    if (optRes.ok) {
      const optJson = await optRes.json();
      if (Array.isArray(optJson.results) && optJson.results.length > 0) {
        hasOptions = true;
      }
    }
  }

  // 🔄 Fallback — use Yahoo Finance if Polygon returns nothing
  if (!hasOptions) {
    try {
      const yOpt = await yahooFinance.options(upperTicker);
      if (yOpt?.options?.length > 0) {
        hasOptions = true;
      }
    } catch {
      // yahooFinance.options sometimes throws for tickers with no chain — safe to ignore
    }
  }
} catch (err) {
  console.error("Options detection failed:", err);
}

    // ---------- SEC Filings ----------
    let filings: Filing[] = [];
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
          (c: any) => c.ticker?.toUpperCase() === upperTicker
        );
        if (entry) {
          const cik = entry.cik_str.toString().padStart(10, "0");
          const secRes = await fetch(
            `https://data.sec.gov/submissions/CIK${cik}.json`,
            { headers: { "User-Agent": "pump-scorecard", Accept: "application/json" } }
          );
          if (secRes.ok) {
            const secJson = await secRes.json();
            const biz = parseSecAddress(secJson?.addresses?.business);
            const mail = parseSecAddress(secJson?.addresses?.mailing);
            if (biz?.country && biz.country !== "Unknown") {
              secCountry = biz.country;
            }
            const recent = secJson?.filings?.recent;
            if (recent?.form && Array.isArray(recent.form)) {
              filings =
                recent.form
                  .map((form: string, idx: number) => ({
                    title: form || "Untitled Filing",
                    date: recent.filingDate[idx] || "Unknown",
                    url: `https://www.sec.gov/Archives/edgar/data/${cik}/${recent.accessionNumber[idx].replace(
                      /-/g,
                      ""
                    )}/${recent.primaryDocument[idx]}`,
                    businessAddress: biz,
                    mailingAddress: mail,
                  }))
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 8) || [];
            }
          }
        }
      }
    } catch {}

    // ---------- Promotions ----------
    let promotions: Promotion[] = [];
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
    } catch {}
    if (!promotions.length) {
      promotions = [{ type: "Manual Check", date: "", url: "https://www.stockpromotiontracker.com/" }];
    }

    // ---------- Fraud ----------
    let fraudImages: FraudImage[] = [];
    try {
      const fraudRes = await fetch(
        `https://www.stopnasdaqchinafraud.com/api/stop-nasdaq-fraud?page=0&searchText=${upperTicker}`,
        { headers: { "User-Agent": "pump-scorecard" } }
      );
      if (fraudRes.ok) {
        const fraudJson = await fraudRes.json();
        const rawResults = Array.isArray(fraudJson?.results) ? fraudJson.results : [];
        const U = upperTicker.toUpperCase();

        const normalize = (s: unknown) =>
          String(s ?? "")
            .toUpperCase()
            .replace(/[$#@()[\]{}.,;:!?'"\-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        const hasTickerToken = (s: string) => {
          const re = new RegExp(`(^|[^A-Z0-9])${U}([^A-Z0-9]|$)`);
          return re.test(s);
        };

        const strongMatches = rawResults.filter((r: any) => {
          const fields: string[] = [
            r.caption,
            r.text,
            r.title,
            r.postTitle,
            Array.isArray(r.symbols) ? r.symbols.join(" ") : "",
            Array.isArray(r.tickers) ? r.tickers.join(" ") : "",
            r.imagePath,
            r.thumbnailPath,
          ].map(normalize);
          return hasTickerToken(fields.join(" | "));
        });

        fraudImages = strongMatches
          .map((img: any) => ({
            full: img.imagePath
              ? `https://eagyqnmtlkoahfqqhgwc.supabase.co/storage/v1/object/public/${img.imagePath}`
              : null,
            thumb: img.thumbnailPath
              ? `https://eagyqnmtlkoahfqqhgwc.supabase.co/storage/v1/object/public/${img.thumbnailPath}`
              : null,
            date: img.approvedAt
              ? new Date(img.approvedAt).toISOString()
              : img.uploadedAt
              ? new Date(img.uploadedAt).toISOString()
              : null,
            caption: img.caption ?? img.text ?? img.title ?? img.postTitle ?? "Evidence",
            sourceUrl: img.link ?? img.url ?? img.postUrl ?? null,
          }))
          .filter((img: FraudImage) => img.full && img.thumb);

        fraudImages = fraudImages.sort((a, b) => {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
      }
    } catch (err) {
      console.error("Fraud fetch error:", err);
    }

    if (!fraudImages || fraudImages.length === 0) {
      fraudImages = [
        {
          full: null,
          thumb: null,
          date: null,
          caption: "Manual Check",
          sourceUrl: `https://www.stopnasdaqchinafraud.com/?q=${encodeURIComponent(
            upperTicker
          )}`,
        },
      ];
    }

// ---------- Droppiness ----------
let droppinessScore = 0;
let droppinessDetail: Array<{ date: string; spikePct: number; retraced: boolean }> = [];
let intraday: IntradayCandle[] = [];

try {
  // ⏱ Shorter lookback: 18 months instead of 24
  const EIGHTEEN_MONTHS_MS = 1000 * 60 * 60 * 24 * 547;
  const startDate = new Date(Date.now() - EIGHTEEN_MONTHS_MS);
  const endDate = new Date();
  const startDateStr = startDate.toISOString().slice(0, 10);
  const endDateStr = endDate.toISOString().slice(0, 10);
  const polygonKey = process.env.POLYGON_API_KEY;

  let oneMinBars: any[] = [];
  if (polygonKey) {
    let url: string | null = `https://api.polygon.io/v2/aggs/ticker/${upperTicker}/range/1/minute/${startDateStr}/${endDateStr}?limit=50000&apiKey=${polygonKey}`;
    let pageCount = 0;

    while (url && pageCount < 10) { // limit pagination to avoid 100k+ bars
      const res = await fetch(url);
      if (!res.ok) break;
      const json = await res.json();
      if (json.results?.length) {
        oneMinBars.push(
          ...json.results.map((c: any) => ({
            t: c.t,
            o: c.o,
            h: c.h,
            l: c.l,
            c: c.c,
            v: c.v,
          }))
        );
      }
      url = json.next_url ? `${json.next_url}&apiKey=${polygonKey}` : null;
      pageCount++;
    }
  }

  // 📉 Aggregate into 8-hour buckets instead of 4
  const bucketMs = 1000 * 60 * 60 * 8;
  const candles: IntradayCandle[] = [];
  let bucket: any = null;

  for (const bar of oneMinBars) {
    const barTime = new Date(bar.t);
    const bucketTime = Math.floor(barTime.getTime() / bucketMs) * bucketMs;

    if (!bucket || bucket.bucketTime !== bucketTime) {
      if (bucket) candles.push(bucket);
      bucket = {
        bucketTime,
        date: new Date(bucketTime),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      };
    } else {
      bucket.high = Math.max(bucket.high, bar.h);
      bucket.low = Math.min(bucket.low, bar.l);
      bucket.close = bar.c;
      bucket.volume += bar.v;
    }
  }
  if (bucket) candles.push(bucket);

  intraday = candles;

  // 🧮 Droppiness scoring logic (v1 default, v2 behind flag)
  let spikeCount = 0;
  let retraceCount = 0;
  const spikesForV2: Array<{ ageDays: number; retraced: boolean }> = [];
  const nowMs = Date.now();

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev.close || !cur.close || !cur.high) continue;

    const spikePct = (cur.high - prev.close) / prev.close;
    if (spikePct > 0.2) {
      spikeCount++;
      let retraced = false;
      if ((cur.high - cur.close) / cur.high > 0.1) retraced = true;
      if (!retraceCount && candles[i + 1] && candles[i + 1].close < cur.close * 0.9) retraced = true;

      if (retraced) retraceCount++;
      droppinessDetail.push({
        date: cur.date.toISOString(),
        spikePct: +(spikePct * 100).toFixed(1),
        retraced,
      });

      // collect for v2 (recency-weighted)
      const ageDays = Math.max(0, (nowMs - cur.date.getTime()) / (1000 * 60 * 60 * 24));
      spikesForV2.push({ ageDays, retraced });
    }
  }

  // Bayesian shrinkage toward neutral prior with recency-weighted effective N
  const tauDays = 365; // recency horizon
  const priorStrength = 3; // k
  const priorMean = 0.5; // p0 (neutral)

  let weightedSum = 0;
  let weightTotal = 0;
  for (const s of spikesForV2) {
    const w = Math.exp(-s.ageDays / tauDays);
    weightedSum += w * (s.retraced ? 1 : 0);
    weightTotal += w;
  }

  const nEff = weightTotal; // effective sample size
  const pHat = weightTotal > 0 ? weightedSum / weightTotal : 0.5;
  const pAdj = (nEff * pHat + priorStrength * priorMean) / (nEff + priorStrength);

  // Cap to avoid 100% from a single spike
  let scoreV2 = Math.round(Math.max(0, Math.min(1, pAdj)) * 100);
  if (spikeCount < 2) scoreV2 = Math.min(scoreV2, 85);
  droppinessScore = scoreV2;

} catch (err) {
  console.error("Droppiness fetch failed:", err);
}

    // ---------- Country ----------
    let country = "Unknown";
    let countrySource = "Unknown";
    if (secCountry) {
      country = secCountry.trim();
      countrySource = "SEC";
    } else if (polyMeta?.results?.country) {
      country = String(polyMeta.results.country).trim();
      countrySource = "Polygon";
    } else if (polyMeta?.results?.locale) {
      country =
        String(polyMeta.results.locale).toUpperCase() === "US"
          ? "United States"
          : String(polyMeta.results.locale).trim();
      countrySource = "Polygon";
    } else if (quote.country) {
      country = String(quote.country).trim();
      countrySource = "Yahoo";
    }

    const overrides: Record<string, string> = { UOKA: "China", MBX: "Singapore", JDZG: "China" };
    if (overrides[upperTicker]) {
      country = overrides[upperTicker];
      countrySource = "Manual Override";
    }

    // ---------- Scores ----------
    const latest = history.at(-1) || {};
    const prev = history.at(-2) || latest;
    const avgVol =
      history.reduce((s, q) => s + (q.volume || 0), 0) / (history.length || 1) || 0;

    const sudden_volume_spike =
      !!(latest as any).volume && avgVol > 0 && (latest as any).volume > avgVol * 3;
    const sudden_price_spike =
      (latest as any).close > ((prev as any).close || (latest as any).close) * 1.25;

    let weightedRiskScore = 0;
    if (sudden_volume_spike) weightedRiskScore += 20;
    if (sudden_price_spike) weightedRiskScore += 20;
    if (filings.some((f) => f.title.includes("S-1") || f.title.includes("424B")))
      weightedRiskScore += 20;
    if (fraudImages.length > 0 && !fraudImages[0].caption?.includes("Manual"))
      weightedRiskScore += 20;
    if (droppinessScore >= 70) weightedRiskScore -= 15;
    else if (droppinessScore < 40) weightedRiskScore += 15;

    const RISKY = new Set(["China", "Hong Kong", "Malaysia", "Singapore"]);
    if (RISKY.has(country)) weightedRiskScore += 15;
    if (weightedRiskScore < 0) weightedRiskScore = 0;

    let summaryVerdict: "Low risk" | "Moderate risk" | "High risk" = "Low risk";
    if (weightedRiskScore >= 70) summaryVerdict = "High risk";
    else if (weightedRiskScore >= 40) summaryVerdict = "Moderate risk";

    const summaryText =
      summaryVerdict === "Low risk"
        ? "This one looks pretty clean — no major pump-and-dump signals right now."
        : summaryVerdict === "Moderate risk"
        ? "Worth keeping an eye on. Not screaming pump yet, but caution is warranted."
        : "This stock is lighting up the board — multiple risk signals make it look like a prime pump-and-dump candidate.";

    // ---------- BorrowDesk ----------
    const borrowData = await fetchBorrowDesk(upperTicker);

    // ---------- Return ----------
return NextResponse.json({
  ticker: upperTicker,
  companyName: quote.longName || quote.shortName || upperTicker,

  lastPrice: quote.regularMarketPrice ?? null,
  marketCap: quote.marketCap ?? null,
  sharesOutstanding: quote.sharesOutstanding ?? null,
  floatShares: quote.floatShares ?? quote.sharesOutstanding ?? null,
  avgVolume: quote.averageDailyVolume3Month ?? null,
  latestVolume: quote.regularMarketVolume ?? null,
  shortFloat: toPercent(shortFloat),
  insiderOwnership: toPercent(insiderOwnership),
  institutionalOwnership: toPercent(institutionalOwnership),
  exchange: quote.fullExchangeName || "Unknown",
  country,
  countrySource,
  splits,
  high52Week,
  low52Week,
  companyProfile,
  history,
  intraday,
  filings,
  promotions,
  fraudImages,
  droppinessScore,
  droppinessDetail,
  borrowData,
  weightedRiskScore,
  summaryVerdict,
  summaryText,
  sudden_volume_spike,
  sudden_price_spike,
  dilution_offering: filings.some(
    (f) => f.title.includes("S-1") || f.title.includes("424B")
  ),
  promoted_stock:
    promotions.length > 0 && promotions[0].type !== "Manual Check",
  fraud_evidence:
    fraudImages.length > 0 && !fraudImages[0].caption?.includes("Manual"),
  risky_country: RISKY.has(country),
hasOptions, // true if options exist

});

  } catch (err: any) {
    console.error("scan route failed:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
