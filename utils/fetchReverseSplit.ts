import * as cheerio from "cheerio";

// ---------- Reverse Split Scraper ----------
async function fetchReverseSplit(ticker: string) {
  try {
    const url = "https://dilutiontracker.com/app/reverse-split";
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/117.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
      cache: "no-store", // prevent Next.js from caching
    });

    if (!res.ok) {
      console.error("Reverse split fetch failed with status:", res.status);
      return { found: false, message: `Fetch failed with status ${res.status}` };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    interface SplitResult {
      ratio: string;
      price: string;
      status: string;
    }

    let result: SplitResult | null = null;

    $("tr").each((_: number, el: any) => {
      const cols = $(el).find("td");
      if (cols.length >= 4) {
        const tickerCol = $(cols[0]).text().trim().toUpperCase();
        if (tickerCol === ticker.toUpperCase()) {
          result = {
            ratio: $(cols[1]).text().trim(),
            price: $(cols[2]).text().trim(),
            status: $(cols[3]).text().trim(),
          };
        }
      }
    });

    if (!result) {
      return { found: false, message: `No reverse split found for ${ticker}` };
    }

    // Explicit check to satisfy TypeScript
    const finalResult = result as SplitResult;

    return {
      found: true,
      ratio: finalResult.ratio,
      price: finalResult.price,
      status: finalResult.status,
      message: `Ratio: ${finalResult.ratio}, Price: ${finalResult.price}, Status: ${finalResult.status}`,
    };
  } catch (err) {
    console.error("Reverse split scrape failed:", err);
    return { found: false, message: "Error fetching reverse split info" };
  }
}
