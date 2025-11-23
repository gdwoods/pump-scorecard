// app/api/scan/[ticker]/route.ts
import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";
import { parseSecAddress } from "@/utils/normalizeCountry";
import { fetchBorrowDesk } from "@/utils/fetchBorrowDesk";
import * as cheerio from "cheerio";
import { fetchSentiment } from "@/utils/fetchSentiment";
import { fetchInsiderTransactions } from "@/utils/fetchInsiderTransactions";
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

type PolygonSplit = {
  execution_date: string;
  split_from: number;
  split_to: number;
};

type CikEntry = {
  ticker: string;
  cik_str: number;
  title: string;
};

type PromotionResult = {
  type?: string;
  promotion_date?: string;
};

type FraudResult = {
  caption?: string;
  text?: string;
  title?: string;
  postTitle?: string;
  symbols?: string[];
  tickers?: string[];
  imagePath?: string;
  thumbnailPath?: string;
  approvedAt?: string;
  uploadedAt?: string;
  link?: string;
  url?: string;
  postUrl?: string;
};

type PolygonBar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

interface YahooQuote {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  adjclose?: number | null;
}

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

// Define a type for Yahoo Finance quote result to avoid 'any'
interface YahooQuoteResult {
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  marketCap?: number;
  sharesOutstanding?: number;
  floatShares?: number;
  averageDailyVolume3Month?: number;
  regularMarketVolume?: number;
  fullExchangeName?: string;
  country?: string;
  shortPercentFloat?: number;
  heldPercentInsiders?: number;
  heldPercentInstitutions?: number;
}

// Define a type for Yahoo Finance summary result
interface YahooSummaryResult {
  defaultKeyStatistics?: {
    shortPercentOfFloat?: number;
  };
  insiderHolders?: {
    ownershipList?: Array<{ percentHeld?: number }>;
  };
  institutionOwnership?: {
    ownershipList?: Array<{ percentHeld?: number }>;
  };
  majorHoldersBreakdown?: {
    insidersPercentHeld?: number;
    institutionsPercentHeld?: number;
  };
  summaryProfile?: {
    sector?: string;
    industry?: string;
    fullTimeEmployees?: number;
    website?: string;
    longBusinessSummary?: string;
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  const upperTicker = ticker.toUpperCase();

  try {
    // Define all independent tasks
    const yahooTask = (async () => {
      try {
        const quote = (await yahooFinance.quote(upperTicker)) as YahooQuoteResult;
        const summary = (await yahooFinance.quoteSummary(upperTicker, {
          modules: [
            "defaultKeyStatistics",
            "insiderHolders",
            "institutionOwnership",
            "majorHoldersBreakdown",
            "summaryProfile",
          ],
        })) as YahooSummaryResult;

        const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 180;
        const chart = await yahooFinance.chart(upperTicker, {
          period1: new Date(Date.now() - SIX_MONTHS_MS),
          period2: new Date(),
          interval: "1d",
        });

        // 52-week high/low
        const TWO_YEARS = 1000 * 60 * 60 * 24 * 730;
        const chartHist = await yahooFinance.chart(upperTicker, {
          period1: new Date(Date.now() - TWO_YEARS),
          period2: new Date(),
          interval: "1d",
        });

        // Options check
        let hasOptions = false;
        try {
          const yOpt = await yahooFinance.options(upperTicker, {});
          if (yOpt && yOpt.options && yOpt.options.length > 0) hasOptions = true;
        } catch { }

        return { quote, summary, chart, chartHist, hasOptions };
      } catch (err) {
        console.error("Yahoo Finance task failed:", err);
        return null;
      }
    })();

    const polygonSplitsTask = (async () => {
      try {
        const polygonKey = process.env.POLYGON_API_KEY;
        if (!polygonKey) return [];

        let url: string | null = `https://api.polygon.io/v3/reference/splits?ticker=${upperTicker}&apiKey=${polygonKey}`;
        let allSplits: PolygonSplit[] = [];

        while (url) {
          const splitRes = await fetch(url);
          if (!splitRes.ok) break;
          const splitJson: { results?: PolygonSplit[], next_url?: string } = await splitRes.json();
          allSplits.push(...(splitJson.results || []));
          url = splitJson.next_url ? `${splitJson.next_url}&apiKey=${polygonKey}` : null;
        }
        return allSplits;
      } catch (err) {
        console.error("Polygon splits task failed:", err);
        return [];
      }
    })();

    const polygonMetaTask = (async () => {
      try {
        const polygonKey = process.env.POLYGON_API_KEY;
        if (!polygonKey) return { meta: null, hasOptions: false };

        const [metaRes, optRes] = await Promise.all([
          fetch(`https://api.polygon.io/v3/reference/tickers/${upperTicker}?apiKey=${polygonKey}`),
          fetch(`https://api.polygon.io/v3/reference/options/contracts?ticker=${upperTicker}&limit=1&apiKey=${polygonKey}`)
        ]);

        const meta = metaRes.ok ? await metaRes.json() : null;
        let hasOptions = false;
        if (optRes.ok) {
          const optJson = await optRes.json();
          if (optJson && Array.isArray(optJson.results) && optJson.results.length > 0) hasOptions = true;
        }
        return { meta, hasOptions };
      } catch (err) {
        console.error("Polygon meta task failed:", err);
        return { meta: null, hasOptions: false };
      }
    })();

    const secTask = (async () => {
      try {
        const cikRes = await fetch("https://www.sec.gov/files/company_tickers.json", {
          headers: { "User-Agent": "pump-scorecard (garthwoods@gmail.com)", Accept: "application/json" },
        });
        if (!cikRes.ok) return { filings: [], secCountry: null };

        const cikJson = await cikRes.json();
        const entry = Object.values(cikJson).find((c: unknown) => (c as CikEntry).ticker?.toUpperCase() === upperTicker) as CikEntry | undefined;
        if (!entry) return { filings: [], secCountry: null };

        const cik = entry.cik_str.toString().padStart(10, "0");
        const secRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
          headers: { "User-Agent": "pump-scorecard", Accept: "application/json" },
        });

        if (!secRes.ok) return { filings: [], secCountry: null };

        const secJson = await secRes.json();
        const biz = parseSecAddress(secJson?.addresses?.business);
        const mail = parseSecAddress(secJson?.addresses?.mailing);
        const secCountry = (biz?.country && biz.country !== "Unknown") ? biz.country : null;

        const recent = secJson?.filings?.recent;
        let filings: Filing[] = [];
        if (recent?.form && Array.isArray(recent.form)) {
          filings = recent.form
            .map((form: string, idx: number) => ({
              title: form || "Untitled Filing",
              date: recent.filingDate[idx] || "Unknown",
              url: `https://www.sec.gov/Archives/edgar/data/${cik}/${recent.accessionNumber[idx].replace(/-/g, "")}/${recent.primaryDocument[idx]}`,
              businessAddress: biz,
              mailingAddress: mail,
            }))
            .sort((a: Filing, b: Filing) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 8);
        }
        return { filings, secCountry };
      } catch (err) {
        console.error("SEC task failed:", err);
        return { filings: [], secCountry: null };
      }
    })();

    const promotionsTask = (async () => {
      try {
        const promoRes = await fetch(
          `https://www.stockpromotiontracker.com/api/stock-promotions?ticker=${upperTicker}&dateRange=all&limit=10&offset=0&sortBy=promotion_date&sortDirection=desc`
        );
        if (promoRes.ok) {
          const promoJson = await promoRes.json();
          return (promoJson?.results || []).map((p: PromotionResult) => ({
            type: p.type || "Promotion",
            date: p.promotion_date || "",
            url: "https://www.stockpromotiontracker.com/",
          }));
        }
      } catch (err) {
        console.error("Promotions task failed:", err);
      }
      return [];
    })();

    const fraudTask = (async () => {
      try {
        const fraudRes = await fetch(
          `https://www.stopnasdaqchinafraud.com/api/stop-nasdaq-fraud?page=0&searchText=${upperTicker}`,
          { headers: { "User-Agent": "pump-scorecard" } }
        );
        if (!fraudRes.ok) return [];

        const fraudJson = await fraudRes.json();
        const rawResults = Array.isArray(fraudJson?.results) ? fraudJson.results : [];
        const U = upperTicker.toUpperCase();

        const normalize = (s: unknown) =>
          String(s ?? "").toUpperCase().replace(/[$#@()[\]{}.,;:!?'"\-]/g, " ").replace(/\s+/g, " ").trim();

        const hasTickerToken = (s: string) => {
          const re = new RegExp(`(^|[^A-Z0-9])${U}([^A-Z0-9]|$)`);
          return re.test(s);
        };

        const strongMatches = rawResults.filter((r: FraudResult) => {
          const fields: string[] = [
            r.caption, r.text, r.title, r.postTitle,
            Array.isArray(r.symbols) ? r.symbols.join(" ") : "",
            Array.isArray(r.tickers) ? r.tickers.join(" ") : "",
            r.imagePath, r.thumbnailPath,
          ].map(normalize);
          return hasTickerToken(fields.join(" | "));
        });

        return strongMatches
          .map((img: FraudResult) => ({
            full: img.imagePath ? `https://eagyqnmtlkoahfqqhgwc.supabase.co/storage/v1/object/public/${img.imagePath}` : null,
            thumb: img.thumbnailPath ? `https://eagyqnmtlkoahfqqhgwc.supabase.co/storage/v1/object/public/${img.thumbnailPath}` : null,
            date: img.approvedAt ? new Date(img.approvedAt).toISOString() : img.uploadedAt ? new Date(img.uploadedAt).toISOString() : null,
            caption: img.caption ?? img.text ?? img.title ?? img.postTitle ?? "Evidence",
            sourceUrl: img.link ?? img.url ?? img.postUrl ?? null,
          }))
          .filter((img: FraudImage) => img.full && img.thumb)
          .sort((a: FraudImage, b: FraudImage) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return 1;
            if (!b.date) return -1;
            return new Date(b.date).getTime() - new Date(a.date).getTime();
          });
      } catch (err) {
        console.error("Fraud task failed:", err);
        return [];
      }
    })();

    const droppinessTask = (async () => {
      try {
        const EIGHTEEN_MONTHS_MS = 1000 * 60 * 60 * 24 * 547;
        const startDate = new Date(Date.now() - EIGHTEEN_MONTHS_MS);
        const endDate = new Date();
        const startDateStr = startDate.toISOString().slice(0, 10);
        const endDateStr = endDate.toISOString().slice(0, 10);
        const polygonKey = process.env.POLYGON_API_KEY;

        let oneMinBars: PolygonBar[] = [];
        if (polygonKey) {
          let url: string | null = `https://api.polygon.io/v2/aggs/ticker/${upperTicker}/range/1/minute/${startDateStr}/${endDateStr}?limit=50000&apiKey=${polygonKey}`;
          let pageCount = 0;

          while (url && pageCount < 10) {
            const res = await fetch(url);
            if (!res.ok) break;
            const json: { results?: PolygonBar[], next_url?: string } = await res.json();
            if (json.results?.length) {
              oneMinBars.push(...json.results.map((c: PolygonBar) => ({
                t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v,
              })));
            }
            url = json.next_url ? `${json.next_url}&apiKey=${polygonKey}` : null;
            pageCount++;
          }
        }

        // Aggregate into 8-hour buckets
        const bucketMs = 1000 * 60 * 60 * 8;
        const candles: IntradayCandle[] = [];
        let bucket: IntradayCandle | null = null;

        for (const bar of oneMinBars) {
          const barTime = new Date(bar.t);
          const bucketTime = Math.floor(barTime.getTime() / bucketMs) * bucketMs;

          if (!bucket || bucket.bucketTime !== bucketTime) {
            if (bucket) candles.push(bucket);
            bucket = {
              bucketTime,
              date: new Date(bucketTime),
              open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v,
            };
          } else {
            bucket.high = Math.max(bucket.high, bar.h);
            bucket.low = Math.min(bucket.low, bar.l);
            bucket.close = bar.c;
            bucket.volume += bar.v;
          }
        }
        if (bucket) candles.push(bucket);

        // Scoring logic
        let spikeCount = 0;
        let retraceCount = 0;
        const spikesForV2: Array<{ ageDays: number; retraced: boolean }> = [];
        const nowMs = Date.now();
        let droppinessDetail: Array<{ date: string; spikePct: number; retraced: boolean }> = [];

        for (let i = 1; i < candles.length; i++) {
          const prev = candles[i - 1];
          const cur = candles[i];
          if (!prev.close || !cur.close || !cur.high || !cur.open) continue;

          const spikePctBetweenBuckets = (cur.high - prev.close) / prev.close;
          const spikePctWithinBucket = (cur.high - cur.open) / cur.open;
          const spikePct = Math.max(spikePctBetweenBuckets, spikePctWithinBucket);

          if (spikePct > 0.2) {
            spikeCount++;
            let retraced = false;
            if ((cur.high - cur.close) / cur.high > 0.1) retraced = true;
            if (!retraced && candles[i + 1] && candles[i + 1].close < cur.close * 0.9) retraced = true;

            if (retraced) retraceCount++;
            droppinessDetail.push({
              date: cur.date.toISOString(),
              spikePct: +(spikePct * 100).toFixed(1),
              retraced,
            });

            const ageDays = Math.max(0, (nowMs - cur.date.getTime()) / (1000 * 60 * 60 * 24));
            spikesForV2.push({ ageDays, retraced });
          }
        }

        const tauDays = 365;
        const priorStrength = 3;
        const priorMean = 0.5;
        let weightedSum = 0;
        let weightTotal = 0;
        for (const s of spikesForV2) {
          const w = Math.exp(-s.ageDays / tauDays);
          weightedSum += w * (s.retraced ? 1 : 0);
          weightTotal += w;
        }

        const nEff = weightTotal;
        const pHat = weightTotal > 0 ? weightedSum / weightTotal : 0.5;
        const pAdj = (nEff * pHat + priorStrength * priorMean) / (nEff + priorStrength);
        let scoreV2 = Math.round(Math.max(0, Math.min(1, pAdj)) * 100);
        if (spikeCount < 2) scoreV2 = Math.min(scoreV2, 85);

        return { score: scoreV2, detail: droppinessDetail, intraday: candles };
      } catch (err) {
        console.error("Droppiness task failed:", err);
        return { score: 0, detail: [], intraday: [] };
      }
    })();

    const borrowTask = fetchBorrowDesk(upperTicker);

    const newsTask = (async () => {
      try {
        const { fetchRecentNews, formatNewsForSection } = await import('@/utils/fetchNews');
        const newsItems = await fetchRecentNews(upperTicker);
        return formatNewsForSection(newsItems);
      } catch (err) {
        console.error('News task failed:', err);
        return [];
      }
    })();

    const sentimentTask = fetchSentiment(upperTicker);
    const insiderTransactionsTask = fetchInsiderTransactions(upperTicker);

    // Execute all tasks in parallel
    const [
      yahooRes,
      splitsRes,
      polyMetaRes,
      secRes,
      promotionsRes,
      fraudRes,
      droppinessRes,
      borrowRes,
      newsRes,
      sentimentRes,
      insiderTransactionsRes
    ] = await Promise.allSettled([
      yahooTask,
      polygonSplitsTask,
      polygonMetaTask,
      secTask,
      promotionsTask,
      fraudTask,
      droppinessTask,
      borrowTask,
      newsTask,
      sentimentTask,
      insiderTransactionsTask
    ]);

    // Extract results
    const yahooData = yahooRes.status === 'fulfilled' ? yahooRes.value : null;
    const splits = splitsRes.status === 'fulfilled' ? splitsRes.value : [];
    const polyMeta = polyMetaRes.status === 'fulfilled' ? polyMetaRes.value : { meta: null, hasOptions: false };
    const secData = secRes.status === 'fulfilled' ? secRes.value : { filings: [], secCountry: null };
    let promotions = promotionsRes.status === 'fulfilled' ? promotionsRes.value : [];
    let fraudImages = fraudRes.status === 'fulfilled' ? fraudRes.value : [];
    const droppinessData = droppinessRes.status === 'fulfilled' ? droppinessRes.value : { score: 0, detail: [], intraday: [] };
    const borrowData = borrowRes.status === 'fulfilled' ? borrowRes.value : null;
    const sentimentData = sentimentRes.status === 'fulfilled' ? sentimentRes.value : null;
    const insiderTransactions = insiderTransactionsRes.status === 'fulfilled' ? insiderTransactionsRes.value : [];
    const news = newsRes.status === 'fulfilled' ? newsRes.value : [];

    // Process Yahoo Data
    const quote = yahooData?.quote || {};
    const summary = yahooData?.summary || {};
    const chart = yahooData?.chart || { quotes: [] };
    const chartHist = yahooData?.chartHist || { quotes: [] };

    // Helper for percentages
    const toPercent = (raw: unknown): number | null => {
      const n = Number(raw);
      if (!isFinite(n) || n < 0) return null;
      if (n <= 1.5) return +(n * 100).toFixed(1);
      if (n <= 100) return +n.toFixed(1);
      if (n <= 10000) return +(n / 100).toFixed(1);
      return 100.0;
    };

    let shortFloat = quote?.shortPercentFloat ?? null;
    let insiderOwnership = quote?.heldPercentInsiders ?? null;
    let institutionalOwnership = quote?.heldPercentInstitutions ?? null;

    const stats = summary?.defaultKeyStatistics || {};
    const insiders = summary?.insiderHolders || {};
    const institutions = summary?.institutionOwnership || {};
    const holders = summary?.majorHoldersBreakdown || {};

    if (shortFloat == null && stats.shortPercentOfFloat != null) shortFloat = stats.shortPercentOfFloat;
    if (insiderOwnership == null && insiders.ownershipList && Array.isArray(insiders.ownershipList)) insiderOwnership = insiders.ownershipList[0]?.percentHeld ?? null;
    if (institutionalOwnership == null && institutions.ownershipList && Array.isArray(institutions.ownershipList)) institutionalOwnership = institutions.ownershipList[0]?.percentHeld ?? null;
    if (insiderOwnership == null && holders.insidersPercentHeld != null) insiderOwnership = holders.insidersPercentHeld;
    if (institutionalOwnership == null && holders.institutionsPercentHeld != null) institutionalOwnership = holders.institutionsPercentHeld;

    let companyProfile: CompanyProfile | null = null;
    if (summary?.summaryProfile) {
      companyProfile = {
        sector: summary.summaryProfile.sector || undefined,
        industry: summary.summaryProfile.industry || undefined,
        employees: summary.summaryProfile.fullTimeEmployees || undefined,
        website: summary.summaryProfile.website || undefined,
        summary: summary.summaryProfile.longBusinessSummary || undefined,
      };
    }

    const history = chart.quotes?.map((q: YahooQuote) => ({
      date: q.date?.toISOString().split("T")[0] || "",
      open: q.open ?? 0,
      high: q.high ?? 0,
      low: q.low ?? 0,
      close: q.close ?? 0,
      volume: q.volume ?? 0,
    })) || [];

    // 52-week high/low
    let high52Week: number | null = null;
    let low52Week: number | null = null;
    const closes = chartHist.quotes?.map((q: YahooQuote) => q.close).filter((c): c is number => typeof c === 'number') || [];
    if (closes.length > 0) {
      const lastYear = closes.slice(-252);
      high52Week = Math.max(...lastYear);
      low52Week = Math.min(...lastYear);
    }

    // Splits filtering
    const THREE_YEARS = 1000 * 60 * 60 * 24 * 365 * 3;
    const filteredSplits = splits
      .map((s: PolygonSplit) => ({
        date: s.execution_date,
        ratio: `${s.split_to}-for-${s.split_from}`,
      }))
      .filter((s: { date: string }) => new Date(s.date).getTime() > Date.now() - THREE_YEARS);

    // Options
    let hasOptions = yahooData?.hasOptions || polyMeta.hasOptions;

    // Fallback for promotions/fraud
    if (!promotions.length) {
      promotions = [{ type: "Manual Check", date: "", url: "https://www.stockpromotiontracker.com/" }];
    }
    if (!fraudImages.length) {
      fraudImages = [{
        full: null, thumb: null, date: null, caption: "Manual Check",
        sourceUrl: `https://www.stopnasdaqchinafraud.com/?q=${encodeURIComponent(upperTicker)}`,
      }];
    }

    // Country Logic
    let country = "Unknown";
    let countrySource = "Unknown";
    if (secData.secCountry) {
      country = secData.secCountry.trim();
      countrySource = "SEC";
    } else if (polyMeta.meta?.results?.country) {
      country = String(polyMeta.meta.results.country).trim();
      countrySource = "Polygon";
    } else if (polyMeta.meta?.results?.locale) {
      country = String(polyMeta.meta.results.locale).toUpperCase() === "US" ? "United States" : String(polyMeta.meta.results.locale).trim();
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

    // Scoring
    const latest = history.at(-1) || {};
    const prev = history.at(-2) || latest;
    const avgVol = history.reduce((s: number, q: { volume?: number }) => s + (q.volume || 0), 0) / (history.length || 1) || 0;

    const sudden_volume_spike = !!(latest as { volume?: number }).volume && avgVol > 0 && ((latest as { volume?: number }).volume || 0) > avgVol * 3;
    const sudden_price_spike = ((latest as { close?: number }).close || 0) > ((prev as { close?: number }).close || (latest as { close?: number }).close || 0) * 1.25;

    let weightedRiskScore = 0;
    if (sudden_volume_spike) weightedRiskScore += 20;
    if (sudden_price_spike) weightedRiskScore += 20;
    if (secData.filings.some((f: Filing) => f.title.includes("S-1") || f.title.includes("424B"))) weightedRiskScore += 20;
    if (fraudImages.length > 0 && !fraudImages[0].caption?.includes("Manual")) weightedRiskScore += 20;

    const droppinessScore = droppinessData.score;
    if (droppinessScore >= 70) weightedRiskScore -= 15;
    else if (droppinessScore < 40) weightedRiskScore += 15;

    const RISKY = new Set(["China", "Hong Kong", "Malaysia", "Singapore"]);
    if (RISKY.has(country)) weightedRiskScore += 15;
    if (weightedRiskScore < 0) weightedRiskScore = 0;

    let summaryVerdict: "Low risk" | "Moderate risk" | "High risk" = "Low risk";
    if (weightedRiskScore >= 70) summaryVerdict = "High risk";
    else if (weightedRiskScore >= 40) summaryVerdict = "Moderate risk";

    const summaryText = summaryVerdict === "Low risk"
      ? "This one looks pretty clean — no major pump-and-dump signals right now."
      : summaryVerdict === "Moderate risk"
        ? "Worth keeping an eye on. Not screaming pump yet, but caution is warranted."
        : "This stock is lighting up the board — multiple risk signals make it look like a prime pump-and-dump candidate.";

    let droppinessVerdict = "Mixed behavior — some spikes retraced quickly, while others held their gains.";
    if (droppinessScore === 0 && !droppinessData.detail.length) {
      droppinessVerdict = "No qualifying spikes were detected in the last 18 months — the stock has not shown pump-like behavior recently.";
    } else if (droppinessScore >= 70) {
      droppinessVerdict = "Spikes usually fade quickly — most large moves retraced within a few sessions.";
    } else if (droppinessScore < 40) {
      droppinessVerdict = "Spikes often hold — many large moves remained elevated after the initial run-up.";
    }

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
      splits: filteredSplits,
      high52Week,
      low52Week,
      companyProfile,
      history,
      intraday: droppinessData.intraday,
      filings: secData.filings,
      promotions,
      fraudImages,
      droppinessScore,
      droppinessDetail: droppinessData.detail,
      droppinessVerdict,
      borrowData,
      weightedRiskScore,
      summaryVerdict,
      summaryText,
      sudden_volume_spike,
      sudden_price_spike,
      dilution_offering: secData.filings.some((f: Filing) => f.title.includes("S-1") || f.title.includes("424B")),
      promoted_stock: promotions.length > 0 && promotions[0].type !== "Manual Check",
      fraud_evidence: fraudImages.length > 0 && !fraudImages[0].caption?.includes("Manual"),
      risky_country: RISKY.has(country),
      hasOptions,
      news,
      sentiment: sentimentData,
      insiderTransactions,
    });

  } catch (err: unknown) {
    const error = err as Error;
    console.error("scan route failed:", error?.message || error);
    console.error("Error stack:", error?.stack);

    let errorMessage = error?.message || "Internal Server Error";
    let statusCode = 500;
    if (errorMessage.includes("Invalid ticker") || errorMessage.includes("not found")) {
      statusCode = 404;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        ticker: upperTicker,
        ...(process.env.NODE_ENV === 'development' && { stack: error?.stack })
      },
      { status: statusCode }
    );
  }
}
