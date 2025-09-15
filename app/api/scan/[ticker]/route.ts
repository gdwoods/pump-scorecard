import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

// helper: get CIK from SEC master list
async function fetchCIK(ticker: string): Promise<string | null> {
  try {
    const url = "https://www.sec.gov/files/company_tickers.json";
    const res = await fetch(url, {
      headers: { "User-Agent": "pump-scorecard (your-email@example.com)" },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const values = Object.values(data) as any[];

    const entry = values.find((c) => c.ticker.toUpperCase() === ticker.toUpperCase());
    return entry ? entry.cik_str.toString().padStart(10, "0") : null;
  } catch (err) {
    console.error("CIK lookup error:", err);
    return null;
  }
}

// fetch filings from SEC EDGAR
async function fetchEdgarFilings(cik: string) {
  try {
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "pump-scorecard (your-email@example.com)" },
    });
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.filings?.recent) return [];

    return data.filings.recent.form.map((form: string, i: number) => ({
      date: data.filings.recent.acceptanceDateTime[i],
      form,
      reason: form,
      url: `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${data.filings.recent.accessionNumber[i].replace(/-/g, "")}/${data.filings.recent.primaryDocument[i]}`,
    }));
  } catch (err) {
    console.error("EDGAR fetch error:", err);
    return [];
  }
}

export async function GET(
  req: Request,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase();

  try {
    // fundamentals
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData"],
    });

    const marketCap = quote.price?.marketCap;
    const sharesOutstanding = quote.price?.sharesOutstanding;
    const floatShares = quote.defaultKeyStatistics?.floatShares;
    const shortFloat = quote.defaultKeyStatistics?.shortPercentOfFloat;
    const insiderOwn = quote.defaultKeyStatistics?.insiderPercentHeld;
    const instOwn = quote.defaultKeyStatistics?.institutionPercentHeld;

    // history (90 days)
    const chart = await yahooFinance.chart(ticker, {
      period1: new Date(Date.now() - 90 * 24 * 3600 * 1000),
      interval: "1d",
    });

    const history =
      chart.quotes?.map((q) => ({
        date: q.date.toISOString().split("T")[0],
        close: q.close,
        volume: q.volume,
      })) ?? [];

    // SEC filings
    const cik = await fetchCIK(ticker);
    const sec_flags = cik ? await fetchEdgarFilings(cik) : [];

    // squeeze risk score
    const floatTurnover =
      floatShares && chart.quotes?.length
        ? (chart.quotes[chart.quotes.length - 1].volume / floatShares) * 100
        : 0;

    let squeezeRiskScore = Math.round(
      (shortFloat ?? 0) * 200 +
        floatTurnover * 3 +
        (insiderOwn ?? 0) * 200
    );

    squeezeRiskScore = Math.min(100, Math.max(0, squeezeRiskScore));

    const squeezeLabel =
      squeezeRiskScore >= 80
        ? "Extreme"
        : squeezeRiskScore >= 60
        ? "High"
        : squeezeRiskScore >= 40
        ? "Elevated"
        : "Low";

    return NextResponse.json({
      ticker,
      last_price: quote.price?.regularMarketPrice,
      latest_volume: chart.quotes?.[chart.quotes.length - 1]?.volume,
      marketCap,
      sharesOutstanding,
      floatShares,
      shortFloat: shortFloat ? shortFloat * 100 : null,
      insiderOwn: insiderOwn ? insiderOwn * 100 : null,
      instOwn: instOwn ? instOwn * 100 : null,
      floatTurnover,
      history,
      sec_flags,
      squeezeRiskScore,
      squeezeLabel,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
