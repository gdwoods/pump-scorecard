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
  approvedAt: string | null;
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
    console.log("=== iBorrowDesk raw HTML preview ===");
    console.log(html.slice(0, 2000));

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
    } catch {}

    // ---------- News (Finnhub with Yahoo fallback) ----------
    let news: Array<{ title: string; url: string; publisher?: string; published?: number | null }> = [];
    let newsSource: "Finnhub" | "Yahoo" | "None" = "None";

    try {
      const finnhubKey = process.env.FINNHUB_API_KEY;
      let gotFinnhub = false;

      if (finnhubKey) {
        const resp = await fetch(
          `https://finnhub.io/api/v1/company-news?symbol=${upperTicker}&from=${new Date(
            Date.now() - 1000 * 60 * 60 * 24 * 7
          ).toISOString().split("T")[0]}&to=${new Date().toISOString().split("T")[0]}&token=${finnhubKey}`
        );

        if (resp.ok) {
          const json = await resp.json();
          if (Array.isArray(json) && json.length > 0) {
            news = json.slice(0, 5).map((a: any) => ({
              title: a.headline,
              url: a.url,
              publisher: a.source || "Finnhub",
              published: a.datetime ? a.datetime * 1000 : null, // ✅ ms
            }));
            gotFinnhub = true;
            newsSource = "Finnhub";
          }
        }
      }

      if (!gotFinnhub) {
        const newsResp: any = await yahooFinance.search(upperTicker, { newsCount: 5 });
        if (newsResp && Array.isArray(newsResp.news)) {
          news = newsResp.news.map((n: any) => {
            let published: number | null = null;

            if (typeof n.providerPublishTime === "number") {
              published = n.providerPublishTime * 1000; // ✅ ms
            } else if (n.pubDate) {
              const parsed = Date.parse(n.pubDate);
              if (!Number.isNaN(parsed)) published = parsed; // already ms
            }

            return {
              title: n.title,
              url: n.link,
              publisher: n.publisher,
              published,
            };
          });
          if (news.length > 0) newsSource = "Yahoo";
        }
      }
    } catch (err) {
      console.error("News fetch failed:", err);
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
    } catch {}

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
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime()
                  )
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
      promotions = [
        { type: "Manual Check", date: "", url: "https://www.stockpromotiontracker.com/" },
      ];
    }

    // ---------- Fraud Images ----------
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
            approvedAt: img.approvedAt || null,
            caption: img.caption ?? img.text ?? img.title ?? img.postTitle ?? "",
            sourceUrl: img.link ?? img.url ?? img.postUrl ?? null,
          }))
          .filter((img: FraudImage) => img.full && img.thumb);
      }
    } catch {}

    if (!fraudImages || fraudImages.length === 0) {
      fraudImages = [
        {
          full: null,
          thumb: null,
          approvedAt: null,
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
      const TWENTYFOUR_MONTHS_MS = 1000 * 60 * 60 * 24 * 730;
      const startDate = new Date(Date.now() - TWENTYFOUR_MONTHS_MS);
      const endDate = new Date();
      const startDateStr = startDate.toISOString().slice(0, 10);
      const endDateStr = endDate.toISOString().slice(0, 10);

      let oneMinBars: any[] = [];
      const polygonKey = process.env.POLYGON_API_KEY;
      if (polygonKey) {
        let url: string | null = `https://api.polygon.io/v2/aggs/ticker/${upperTicker}/range/1/minute/${startDateStr}/${endDateStr}?limit=50000&apiKey=${polygonKey}`;
        while (url) {
          const res = await fetch(url);
          if (!res.ok) break;
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
      }

      const candles: IntradayCandle[] = [];
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
      }
      intraday = candles;

      let spikeCount = 0;
      let retraceCount = 0;
      for (let i = 1; i < candles.length; i++) {
        const prev = candles[i - 1];
        const cur = candles[i];
        if (!prev.close || !cur.close || !cur.high) continue;
        const spikePct = (cur.high - prev.close) / prev.close;
        if (spikePct > 0.2) {
          spikeCount++;
          let retraced = false;
          if ((cur.high - cur.close) / cur.high > 0.1) retraced = true;
          if (!retraced && candles[i + 1] && candles[i + 1].close < cur.close * 0.9)
            retraced = true;
          if (retraced) retraceCount++;
          const spikeDate =
            cur.date instanceof Date ? cur.date : new Date(cur.date);

          if (spikeDate.getTime() <= Date.now()) {
            droppinessDetail.push({
              date: spikeDate.toISOString(),
              spikePct: +(spikePct * 100).toFixed(1),
              retraced,
            });
          }
        }
      }
      droppinessScore = spikeCount > 0 ? Math.round((retraceCount / spikeCount) * 100) : 0;
    } catch {}

    // ---------- Country (decide once; used by scoring & response) ----------
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
    // ---------- Manual country overrides ----------
    const overrides: Record<string, string> = {
      UOKA: "China",
      MBX: "Singapore",
      // add more tickers as needed
    };

    if (overrides[upperTicker]) {
      country = overrides[upperTicker];
      countrySource = "Manual Override";
    }

    // ---------- Scores ----------
    const latest = history.at(-1) || {};
    const prev = history.at(-2) || latest;
    const avgVol =
      history.reduce((s, q) => s + (q.volume || 0), 0) /
        (history.length || 1) || 0;

    const sudden_volume_spike =
      !!(latest as any).volume &&
      avgVol > 0 &&
      (latest as any).volume > avgVol * 3;

    const sudden_price_spike =
      (latest as any).close >
      ((prev as any).close || (latest as any).close) * 1.25;

    let weightedRiskScore = 0;
    if (sudden_volume_spike) weightedRiskScore += 20;
    if (sudden_price_spike) weightedRiskScore += 20;

    // Dilution proxy (S-1 / 424B)
    if (filings.some((f) => f.title.includes("S-1") || f.title.includes("424B"))) {
      weightedRiskScore += 20;
    }

    // External fraud evidence (only counts when not a manual placeholder)
    if (fraudImages.length > 0 && !fraudImages[0].caption?.includes("Manual")) {
      weightedRiskScore += 20;
    }

    // Droppiness adjustment (history of fades is bearish on credibility)
    if (droppinessScore >= 70) weightedRiskScore -= 15;
    else if (droppinessScore < 40) weightedRiskScore += 15;

    // Risky country adjustment (now includes Singapore)
    const RISKY = new Set(["China", "Hong Kong", "Malaysia", "Singapore"]);
    if (RISKY.has(country)) {
      weightedRiskScore += 15;
    }

    // Clamp to non-negative
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

// ---------- iBorrowDesk ----------
const borrowData = await fetchBorrowDesk(upperTicker);


    // ---------- Return ----------
    return NextResponse.json({
      ticker: upperTicker,
      companyName: quote.longName || quote.shortName || upperTicker,

      // Fundamentals
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

      // Series / details
      history,
      intraday,
      filings,
      news,
      newsSource,
      promotions,
      fraudImages,
      droppinessScore,
      droppinessDetail,

      // ✅ New iBorrowDesk section
      borrowData,

      // Scoring
      weightedRiskScore,
      summaryVerdict,
      summaryText,

      // Flags for UI
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch: false, // set earlier if you kept that logic; or compute here
      reverse_split: false,                    // set earlier if you kept that logic; or compute here
      dilution_offering: filings.some(
        (f) => f.title.includes("S-1") || f.title.includes("424B")
      ),
      promoted_stock: promotions.length > 0 && promotions[0].type !== "Manual Check",
      promotionEvidence: promotions
        .filter((p) => p.type !== "Manual Check")
        .map((p) => ({ source: "StockPromotionTracker", title: p.type, date: p.date, url: p.url })),
      fraud_evidence:
        fraudImages.length > 0 && !fraudImages[0].caption?.includes("Manual"),
      risky_country: RISKY.has(country),
    });
  } catch (err: any) {
    console.error("scan route failed:", err?.message || err);
    droppinessDetail = droppinessDetail.filter(d => new Date(d.date).getTime() <= Date.now());

    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
