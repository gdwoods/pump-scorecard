// app/api/scan/[ticker]/route.ts
import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { parseSecAddress } from "@/utils/normalizeCountry";
import { fetchBorrowDesk } from "@/utils/fetchBorrowDesk";
import * as cheerio from "cheerio";
import { fetchSentiment } from "@/utils/fetchSentiment";
import { fetchInsiderTransactions } from "@/utils/fetchInsiderTransactions";
import { tickerCache, getTickerCacheKey, isCacheValid, getCachedData, setCachedData } from "@/lib/cache";
import { computeDroppiness } from "@/lib/droppiness/compute";
import { persistDroppiness } from "@/lib/droppiness/kv";
import { runCapitalPressure } from "@/lib/capitalPressure/run";
import { unavailableCapitalPressure } from "@/lib/capitalPressure/unavailable";
import { computeLegacyWeightedRiskScore } from "@/lib/scan/legacyWeightedRiskScore";
export const runtime = "nodejs";
export const maxDuration = 60;

// Initialize Yahoo Finance instance (v3 requires instantiation)
const yahooFinance = new YahooFinance();

// Suppress Yahoo Finance survey notice
try {
  yahooFinance.suppressNotices(['yahooSurvey']);
} catch {}

type HistoryPoint = { date: string; close: number; volume: number };
type Filing = {
  title: string;
  date: string;
  url: string;
  businessAddress?: any;
  mailingAddress?: any;
};
type Promotion = { type: string; date: string; url: string };
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
    marketCap?: number;
    sharesOutstanding?: number;
    floatShares?: number;
    sharesShort?: number;
    currentPrice?: number;
    previousClose?: number;
    regularMarketPrice?: number;
    averageVolume?: number;
    averageVolume10days?: number;
    averageDailyVolume10Day?: number;
    volume?: number;
    [key: string]: any; // Allow any other fields
  };
  financialData?: {
    currentPrice?: number;
    totalRevenue?: number;
    revenuePerShare?: number;
    [key: string]: any;
  };
  quoteType?: {
    exchange?: string;
    symbol?: string;
    [key: string]: any;
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
    // Check cache first to avoid hitting Yahoo Finance unnecessarily
    const cacheKey = getTickerCacheKey(upperTicker);
    if (isCacheValid(tickerCache, cacheKey)) {
      const cachedData = getCachedData(tickerCache, cacheKey);
      if (cachedData) {
        console.log(`[${upperTicker}] Using cached data (avoiding Yahoo Finance API call)`);
        return NextResponse.json(cachedData);
      }
    }

    // Define all independent tasks
    const yahooTask = (async () => {
      const maxRetries = 3;
      let retryCount = 0;
      let quote: YahooQuoteResult | null = null;
      let summary: YahooSummaryResult | null = null;
      
      while (retryCount < maxRetries) {
        try {
          // Add delay before retry (longer delays for rate limit errors)
          if (retryCount > 0) {
            // Use longer delays for rate limit errors: 5s, 10s, 15s
            const delay = retryCount === 1 ? 5000 : retryCount === 2 ? 10000 : 15000;
            console.log(`[${upperTicker}] Retrying Yahoo Finance request (attempt ${retryCount + 1}/${maxRetries}) after ${delay/1000}s delay...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          quote = (await yahooFinance.quote(upperTicker)) as YahooQuoteResult;
          summary = (await yahooFinance.quoteSummary(upperTicker, {
            modules: [
              "summaryProfile",
              "defaultKeyStatistics",
              "financialData",
              "quoteType",
              "insiderHolders",
              "institutionOwnership",
              "majorHoldersBreakdown",
            ],
          })) as YahooSummaryResult;

          // Debug: Log actual structure for debugging (only log full object in dev)
          if (process.env.NODE_ENV === "development") {
            console.log(`[${upperTicker}] Raw quote object:`, JSON.stringify(quote, null, 2));
            if (summary?.defaultKeyStatistics) {
              console.log(`[${upperTicker}] Raw defaultKeyStatistics:`, JSON.stringify(summary.defaultKeyStatistics, null, 2));
            }
          }
          
          // Success - break out of retry loop
          break;
        } catch (err: any) {
          retryCount++;
          const errorMessage = err?.message || String(err);
          
          // Check if it's a rate limit error
          const isRateLimit = errorMessage.includes("Too Many Requests") || 
                             errorMessage.includes("rate limit") ||
                             errorMessage.includes("429") ||
                             (err?.response?.status === 429);
          
          if (isRateLimit && retryCount < maxRetries) {
            console.warn(`[${upperTicker}] Yahoo Finance rate limited (attempt ${retryCount}/${maxRetries}):`, errorMessage);
            continue; // Retry
          } else {
            // Non-rate-limit error or max retries reached
            console.error(`[${upperTicker}] Yahoo Finance task failed:`, errorMessage);
            if (retryCount >= maxRetries && isRateLimit) {
              console.error(`[${upperTicker}] Max retries reached for rate limit - Yahoo Finance may be temporarily unavailable`);
            }
            return null; // Give up - cache fallback will be checked in main flow
          }
        }
      }
      
      if (!quote || !summary) {
        return null;
      }

      // Fetch chart data (with retry logic for rate limits)
      let chart: any = { quotes: [] };
      let chartHist: any = { quotes: [] };
      let hasOptions = false;
      
      try {
        const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 180;
        chart = await yahooFinance.chart(upperTicker, {
          period1: new Date(Date.now() - SIX_MONTHS_MS),
          period2: new Date(),
          interval: "1d",
        });

        // 52-week high/low
        const TWO_YEARS = 1000 * 60 * 60 * 24 * 730;
        chartHist = await yahooFinance.chart(upperTicker, {
          period1: new Date(Date.now() - TWO_YEARS),
          period2: new Date(),
          interval: "1d",
        });

        // Options check
        try {
          const yOpt = await yahooFinance.options(upperTicker, {});
          if (yOpt && yOpt.options && yOpt.options.length > 0) hasOptions = true;
        } catch { }
      } catch (chartErr: any) {
        // Chart data is not critical, log but don't fail
        console.warn(`[${upperTicker}] Chart data fetch failed (non-critical):`, chartErr?.message);
      }

      return { quote, summary, chart, chartHist, hasOptions };
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
        if (!cikRes.ok) return { filings: [], secCountry: null, cik: null, submissions: null };

        const cikJson = await cikRes.json();
        const entry = Object.values(cikJson).find((c: unknown) => (c as CikEntry).ticker?.toUpperCase() === upperTicker) as CikEntry | undefined;
        if (!entry) return { filings: [], secCountry: null, cik: null, submissions: null };

          const cik = entry.cik_str.toString().padStart(10, "0");
        const secRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
          headers: { "User-Agent": "pump-scorecard", Accept: "application/json" },
        });

        if (!secRes.ok) return { filings: [], secCountry: null, cik, submissions: null };

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
        return { filings, secCountry, cik, submissions: secJson };
      } catch (err) {
        console.error("SEC task failed:", err);
        return { filings: [], secCountry: null, cik: null, submissions: null };
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

    const droppinessTask = (async () => {
      try {
        const result = await computeDroppiness(upperTicker);
        // Warm drop:{TICKER} for /api/fast — await so Short Check → fast path stays consistent
        try {
          await persistDroppiness(upperTicker, result);
        } catch (persistErr) {
          console.warn(`[${upperTicker}] droppiness KV persist failed`, persistErr);
        }
        return {
          score: result.score,
          detail: result.detail,
          intraday: result.intraday,
        };
      } catch (err) {
        console.error("Droppiness task failed:", err);
        return { score: 0, detail: [], intraday: [] };
      }
    })();

    const borrowTask = fetchBorrowDesk(upperTicker);

    const newsTask = (async () => {
      try {
        const { fetchRecentNews, formatNewsForSection } = await import('@/utils/fetchNews');
        console.log(`[${upperTicker}] Fetching news...`);
        const newsItems = await fetchRecentNews(upperTicker);
        console.log(`[${upperTicker}] Received ${newsItems.length} news items, formatting for section...`);
        const formatted = formatNewsForSection(newsItems);
        console.log(`[${upperTicker}] Formatted ${formatted.length} news items for display`);
        return formatted;
      } catch (err) {
        console.error(`[${upperTicker}] News task failed:`, err);
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
    const secData = secRes.status === 'fulfilled' ? secRes.value : { filings: [], secCountry: null, cik: null, submissions: null };
    let promotions = promotionsRes.status === 'fulfilled' ? promotionsRes.value : [];
    const droppinessData = droppinessRes.status === 'fulfilled' ? droppinessRes.value : { score: 0, detail: [], intraday: [] };
    const borrowData = borrowRes.status === 'fulfilled' ? borrowRes.value : null;
    const sentimentData = sentimentRes.status === 'fulfilled' ? sentimentRes.value : null;
    const insiderTransactions = insiderTransactionsRes.status === 'fulfilled' ? insiderTransactionsRes.value : [];
    const news = newsRes.status === 'fulfilled' ? newsRes.value : [];

    // If Yahoo Finance failed (likely due to rate limit), try to use cached data
    if (!yahooData || !yahooData.quote || Object.keys(yahooData.quote).length === 0) {
      console.warn(`[${upperTicker}] Yahoo Finance returned no data or empty quote object`);
      // Check for cached data as fallback
      const cachedData = getCachedData(tickerCache, cacheKey);
      if (cachedData) {
        console.log(`[${upperTicker}] Falling back to cached data due to Yahoo Finance failure`);
        return NextResponse.json(cachedData);
      }
    }

    // Process Yahoo Data
    const quote = yahooData?.quote || {};
    const summary = yahooData?.summary || {};
    const chart = yahooData?.chart || { quotes: [] };
    const chartHist = yahooData?.chartHist || { quotes: [] };

    // Log if Yahoo data is missing for debugging
    if (!yahooData || Object.keys(quote).length === 0) {
      console.warn(`[${upperTicker}] Yahoo Finance returned no data or empty quote object`);
    } else {
      // Log actual quote keys to see what's available
      console.log(`[${upperTicker}] Yahoo Finance quote keys:`, Object.keys(quote));
      console.log(`[${upperTicker}] Yahoo Finance quote sample:`, {
        regularMarketPrice: quote.regularMarketPrice,
        marketCap: quote.marketCap,
        sharesOutstanding: quote.sharesOutstanding,
        floatShares: quote.floatShares,
        regularMarketVolume: quote.regularMarketVolume,
        averageDailyVolume3Month: quote.averageDailyVolume3Month,
        // Try alternative field names
        price: (quote as any).price,
        market_cap: (quote as any).market_cap,
        shares: (quote as any).shares,
      });
      
      // Log summary defaultKeyStatistics keys
      if (summary?.defaultKeyStatistics) {
        console.log(`[${upperTicker}] defaultKeyStatistics keys:`, Object.keys(summary.defaultKeyStatistics));
        console.log(`[${upperTicker}] defaultKeyStatistics sample:`, {
          marketCap: (summary.defaultKeyStatistics as any).marketCap,
          sharesOutstanding: (summary.defaultKeyStatistics as any).sharesOutstanding,
          floatShares: (summary.defaultKeyStatistics as any).floatShares,
          currentPrice: (summary.defaultKeyStatistics as any).currentPrice,
          regularMarketPrice: (summary.defaultKeyStatistics as any).regularMarketPrice,
          averageVolume: (summary.defaultKeyStatistics as any).averageVolume,
          averageVolume10days: (summary.defaultKeyStatistics as any).averageVolume10days,
          volume: (summary.defaultKeyStatistics as any).volume,
        });
      }
      if (summary?.financialData) {
        console.log(`[${upperTicker}] financialData keys:`, Object.keys(summary.financialData));
        console.log(`[${upperTicker}] financialData sample:`, {
          currentPrice: (summary.financialData as any).currentPrice,
        });
      }
      if (summary?.quoteType) {
        console.log(`[${upperTicker}] quoteType:`, summary.quoteType);
      }
    }

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
    const financial = summary?.financialData || {};
    const quoteType = summary?.quoteType || {};
    const insiders = summary?.insiderHolders || {};
    const institutions = summary?.institutionOwnership || {};
    const holders = summary?.majorHoldersBreakdown || {};

    if (shortFloat == null && stats.shortPercentOfFloat != null) shortFloat = stats.shortPercentOfFloat;
    if (insiderOwnership == null && insiders.ownershipList && Array.isArray(insiders.ownershipList)) insiderOwnership = insiders.ownershipList[0]?.percentHeld ?? null;
    if (institutionalOwnership == null && institutions.ownershipList && Array.isArray(institutions.ownershipList)) institutionalOwnership = institutions.ownershipList[0]?.percentHeld ?? null;
    if (insiderOwnership == null && holders.insidersPercentHeld != null) insiderOwnership = holders.insidersPercentHeld;
    if (institutionalOwnership == null && holders.institutionsPercentHeld != null) institutionalOwnership = holders.institutionsPercentHeld;

    // Try to fill missing fundamentals from multiple sources
    // Priority: quote -> defaultKeyStatistics -> financialData -> chart data
    let marketCap = quote.marketCap ?? stats.marketCap ?? null;
    let sharesOutstanding = quote.sharesOutstanding ?? stats.sharesOutstanding ?? null;
    let floatShares = quote.floatShares ?? stats.floatShares ?? null;
    let lastPrice = quote.regularMarketPrice ?? stats.currentPrice ?? stats.regularMarketPrice ?? financial.currentPrice ?? null;
    let avgVolume = quote.averageDailyVolume3Month ?? stats.averageVolume ?? stats.averageVolume10days ?? stats.averageDailyVolume10Day ?? null;
    let latestVolume = quote.regularMarketVolume ?? stats.volume ?? null;

    // Get latest volume from chart data as fallback
    if (!latestVolume && chart?.quotes && Array.isArray(chart.quotes) && chart.quotes.length > 0) {
      const latestQuote = chart.quotes[chart.quotes.length - 1];
      latestVolume = (latestQuote as any)?.volume ?? null;
    }

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

    // Fallback for promotions
    if (!promotions.length) {
      promotions = [{ type: "Manual Check", date: "", url: "https://www.stockpromotiontracker.com/" }];
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

    const droppinessScore = droppinessData.score;
    const RISKY = new Set(["China", "Hong Kong", "Malaysia", "Singapore"]);
    const dilution_offering = secData.filings.some(
      (f: Filing) => f.title.includes("S-1") || f.title.includes("424B")
    );
    const risky_country = RISKY.has(country);

    const {
      weightedRiskScore,
      summaryVerdict,
      summaryText,
    } = computeLegacyWeightedRiskScore({
      suddenVolumeSpike: sudden_volume_spike,
      suddenPriceSpike: sudden_price_spike,
      dilutionOffering: dilution_offering,
      riskyCountry: risky_country,
    });

    let droppinessVerdict = "Mixed behavior — some spikes retraced quickly, while others held their gains.";
    if (droppinessScore === 0 && !droppinessData.detail.length) {
      droppinessVerdict = "No qualifying spikes were detected in the last 18 months — the stock has not shown pump-like behavior recently.";
    } else if (droppinessScore >= 70) {
      droppinessVerdict = "Spikes usually fade quickly — most large moves retraced within a few sessions.";
    } else if (droppinessScore < 40) {
      droppinessVerdict = "Spikes often hold — many large moves remained elevated after the initial run-up.";
    }

    let capitalPressure;
    try {
      capitalPressure = await runCapitalPressure({
        ticker: upperTicker,
        cik: secData.cik,
        submissions: secData.submissions,
        polygonSplits: filteredSplits,
        context: {
          floatShares,
          shortFloat: toPercent(shortFloat),
          borrowFee: borrowData?.fee ?? null,
          borrowAvailable: borrowData?.available ?? null,
          news: Array.isArray(news)
            ? news.map((n: { title?: string; headline?: string; published?: string | number | null; date?: string }) => ({
                title: n.title || n.headline,
                date:
                  typeof n.published === 'number'
                    ? new Date(n.published).toISOString()
                    : (n.published || n.date || undefined),
              }))
            : [],
          droppinessScore,
          droppinessSpikeCount: Array.isArray(droppinessData.detail)
            ? droppinessData.detail.length
            : 0,
        },
      });
    } catch (err) {
      console.error(`[${upperTicker}] Capital pressure failed:`, err);
      capitalPressure = unavailableCapitalPressure(
        err instanceof Error ? err.message : 'Capital pressure computation failed'
      );
    }

    const responseData = {
      ticker: upperTicker,
      companyName: quote.longName || quote.shortName || upperTicker,
      lastPrice: lastPrice,
      marketCap: marketCap,
      sharesOutstanding: sharesOutstanding,
      floatShares: floatShares ?? sharesOutstanding,
      avgVolume: avgVolume,
      latestVolume: latestVolume,
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
      droppinessScore,
      droppinessSpikeCount: Array.isArray(droppinessData.detail)
        ? droppinessData.detail.length
        : 0,
      droppinessDetail: droppinessData.detail,
      droppinessVerdict,
      borrowData,
      weightedRiskScore,
      weightedRiskScoreDeprecated: true,
      summaryVerdict,
      summaryText,
      sudden_volume_spike,
      sudden_price_spike,
      dilution_offering,
      promoted_stock: promotions.length > 0 && promotions[0].type !== "Manual Check",
      risky_country,
      hasOptions,
      news,
      sentiment: sentimentData,
      insiderTransactions,
      capitalPressure,
    };
    
    // Cache the response data before returning (cacheKey already defined at top of try block)
    setCachedData(tickerCache, cacheKey, responseData);
    
    return NextResponse.json(responseData);

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
