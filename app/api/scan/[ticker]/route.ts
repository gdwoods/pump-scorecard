// app/api/scan/[ticker]/route.ts
import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";
import { parseSecAddress } from "@/utils/normalizeCountry";

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

export async function GET(
  req: Request,
  context: { params: Promise<{ ticker: string }> },
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

    // ---------- Percent normalization helper ----------
    const toPercent = (raw: any): number | null => {
      const n = Number(raw);
      if (!isFinite(n) || n < 0) return null;

      if (n <= 1.5) return +(n * 100).toFixed(1); // fraction
      if (n <= 100) return +n.toFixed(1); // already %
      if (n <= 10000) return +(n / 100).toFixed(1); // over-scaled
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

        if (
          insiderOwnership == null &&
          Array.isArray((insiders as any).ownershipList)
        ) {
          insiderOwnership =
            (insiders as any).ownershipList[0]?.percentHeld ?? null;
        }
        if (
          institutionalOwnership == null &&
          Array.isArray((institutions as any).ownershipList)
        ) {
          institutionalOwnership =
            (institutions as any).ownershipList[0]?.percentHeld ?? null;
        }

        // ✅ majorHoldersBreakdown fallback
        if (insiderOwnership == null && holders.insidersPercentHeld != null) {
          insiderOwnership = holders.insidersPercentHeld;
        }
        if (
          institutionalOwnership == null &&
          holders.institutionsPercentHeld != null
        ) {
          institutionalOwnership = holders.institutionsPercentHeld;
        }
      } catch {
        // optional
      }

      // 6-month daily chart
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

    // ---------- Polygon Meta ----------
    let polyMeta: any = {};
    try {
      const polygonKey = process.env.POLYGON_API_KEY;
      if (polygonKey) {
        const polyRes = await fetch(
          `https://api.polygon.io/v3/reference/tickers/${upperTicker}?apiKey=${polygonKey}`,
        );
        if (polyRes.ok) polyMeta = await polyRes.json();
      }
    } catch {}
    // ---------- SEC Filings ----------
    let filings: Filing[] = [];
    let secCountry: string | null = null;
    try {
      const cikRes = await fetch(
        "https://www.sec.gov/files/company_tickers.json",
        {
          headers: {
            "User-Agent": "pump-scorecard (garthwoods@gmail.com)",
            Accept: "application/json",
          },
        },
      );
      if (cikRes.ok) {
        const cikJson = await cikRes.json();
        const entry = Object.values(cikJson).find(
          (c: any) => c.ticker?.toUpperCase() === upperTicker,
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
            },
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
                    url: `https://www.sec.gov/Archives/edgar/data/${cik}/${recent.accessionNumber[
                      idx
                    ].replace(/-/g, "")}/${recent.primaryDocument[idx]}`,
                    businessAddress: biz,
                    mailingAddress: mail,
                  }))
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime(),
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
        `https://www.stockpromotiontracker.com/api/stock-promotions?ticker=${upperTicker}&dateRange=all&limit=10&offset=0&sortBy=promotion_date&sortDirection=desc`,
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
        {
          type: "Manual Check",
          date: "",
          url: "https://www.stockpromotiontracker.com/",
        },
      ];
    }

    // ---------- Fraud Images ----------
    let fraudImages: FraudImage[] = [];
    try {
      const fraudRes = await fetch(
        `https://www.stopnasdaqchinafraud.com/api/stop-nasdaq-fraud?page=0&searchText=${upperTicker}`,
        { headers: { "User-Agent": "pump-scorecard" } },
      );
      if (fraudRes.ok) {
        const fraudJson = await fraudRes.json();
        const rawResults = Array.isArray(fraudJson?.results)
          ? fraudJson.results
          : [];
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
            caption:
              img.caption ?? img.text ?? img.title ?? img.postTitle ?? "",
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
            upperTicker,
          )}`,
        },
      ];
    }
    // ---------- Droppiness ----------
    let droppinessScore = 0;
    const droppinessDetail: Array<{
      date: string;
      spikePct: number;
      retraced: boolean;
    }> = [];
    let intraday: IntradayCandle[] = [];
    try {
      const TWENTYFOUR_MONTHS_MS = 1000 * 60 * 60 * 24 * 730;
      const startDate = new Date(Date.now() - TWENTYFOUR_MONTHS_MS);
      const endDate = new Date();
      const startDateStr = startDate.toISOString().slice(0, 10);
      const endDateStr = endDate.toISOString().slice(0, 10);

      const oneMinBars: any[] = [];
      const polygonKey = process.env.POLYGON_API_KEY;
      if (polygonKey) {
        let url: string | null =
          `https://api.polygon.io/v2/aggs/ticker/${upperTicker}/range/1/minute/${startDateStr}/${endDateStr}?limit=50000&apiKey=${polygonKey}`;
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
              })),
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
          const bucketTime =
            Math.floor(bar.date.getTime() / bucketMs) * bucketMs;
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
          if (
            !retraced &&
            candles[i + 1] &&
            candles[i + 1].close < cur.close * 0.9
          )
            retraced = true;
          if (retraced) retraceCount++;
          droppinessDetail.push({
            date: cur.date?.toISOString() || "",
            spikePct: +(spikePct * 100).toFixed(1),
            retraced,
          });
        }
      }
      droppinessScore =
        spikeCount > 0 ? Math.round((retraceCount / spikeCount) * 100) : 0;
    } catch {}

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

    let weightedRiskScore = 0;
    if (sudden_volume_spike) weightedRiskScore += 20;
    if (sudden_price_spike) weightedRiskScore += 20;
    if (
      filings.some((f) => f.title.includes("S-1") || f.title.includes("424B"))
    )
      weightedRiskScore += 20;
    if (fraudImages.length > 0 && !fraudImages[0].caption?.includes("Manual"))
      weightedRiskScore += 20;
    if (droppinessScore >= 70) weightedRiskScore -= 15;
    else if (droppinessScore < 40) weightedRiskScore += 15;
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

    // ---------- Fundamentals mismatch ----------
    let valuation_fundamentals_mismatch = false;
    try {
      const marketCap = quote.marketCap || 0;
      const revenue =
        (quote as any)?.totalRevenue || (quote as any)?.revenue || 0;
      if (marketCap > 500_000_000) {
        if (!revenue || revenue <= 0) {
          valuation_fundamentals_mismatch = true;
        } else {
          const ratio = marketCap / revenue;
          if (ratio > 50) valuation_fundamentals_mismatch = true;
        }
      }
    } catch {}

    // ---------- Reverse split ----------
    let reverse_split = false;
    try {
      if (filings.length > 0) {
        reverse_split = filings.some((f) =>
          f.title.toLowerCase().includes("reverse split"),
        );
      }
      if (
        !reverse_split &&
        quote.sharesOutstanding &&
        quote.floatShares &&
        quote.sharesOutstanding < quote.floatShares / 10
      ) {
        reverse_split = true;
      }
    } catch {}

    // ---------- Promoted stock ----------
    let promoted_stock = false;
    const promotionEvidence: {
      source: string;
      title: string;
      date?: string;
      url?: string;
    }[] = [];
    try {
      if (promotions.length > 0 && promotions[0].type !== "Manual Check") {
        promoted_stock = true;
        promotions.forEach((p) =>
          promotionEvidence.push({
            source: "StockPromotionTracker",
            title: p.type,
            date: p.date,
            url: p.url,
          }),
        );
      }
      if (filings.length > 0) {
        filings.forEach((f) => {
          const t = f.title.toLowerCase();
          if (
            t.includes("promotion") ||
            t.includes("promotional") ||
            t.includes("investor awareness") ||
            t.includes("stock promotion")
          ) {
            promoted_stock = true;
            promotionEvidence.push({
              source: "SEC Filing",
              title: f.title,
              date: f.date,
              url: f.url,
            });
          }
        });
      }
    } catch {}

// ---------- Country ----------
let country = "Unknown";
let countrySource = "Unknown";

// Helper: scan any object for keywords
const detectCountry = (addr: any): string | null => {
  if (!addr) return null;
  const hay = JSON.stringify(addr).toUpperCase();
  if (hay.includes("CHINA")) return "China";
  if (hay.includes("HONG KONG")) return "Hong Kong";
  if (hay.includes("MALAYSIA")) return "Malaysia";
  if (hay.includes("SINGAPORE")) return "Singapore";
  return null;
};

// SEC first
let detectedFromSec: string | null = null;
try {
  if (filings.length > 0) {
    const f = filings[0];
    detectedFromSec = detectCountry(f.businessAddress) || detectCountry(f.mailingAddress);
  }
} catch {}

if (secCountry) {
  country = secCountry.trim();
  countrySource = "SEC (direct)";
} else if (detectedFromSec) {
  country = detectedFromSec;
  countrySource = "SEC (address scan)";
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
// ---------- Country Overrides ----------
const overrides: Record<string, string> = {
  UOKA: "China",
  // Add more overrides here if Yahoo/Polygon mislabel ADRs
};

if (overrides[upperTicker]) {
  country = overrides[upperTicker];
  countrySource = "Override Map";
}

const riskyCountries = ["China", "Hong Kong", "Malaysia", "Singapore"];




    return NextResponse.json({
      ticker: upperTicker,
      companyName: quote.longName || quote.shortName || upperTicker,

      // ---------- Fundamentals
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

      // ---------- Other data
      history,
      intraday,
      filings,
      promotions,
      fraudImages,
      droppinessScore,
      droppinessDetail,
      weightedRiskScore,
      summaryVerdict,
      summaryText,

      // ---------- Flags
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      reverse_split,
      dilution_offering: filings.some(
        (f) => f.title.includes("S-1") || f.title.includes("424B"),
      ),
      promoted_stock,
      promotionEvidence,
      fraud_evidence:
        fraudImages.length > 0 && !fraudImages[0].caption?.includes("Manual"),
  risky_country: riskyCountries.includes(country),

    });
  } catch (err: any) {
    console.error("scan route failed:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
