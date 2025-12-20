// utils/fetchHistoricalOS.ts
import yahooFinance from "yahoo-finance2";

export interface HistoricalOSResult {
  shares: number | null;
  source: 'yahoo-finance' | 'sec' | 'unknown';
}

/**
 * Fetch outstanding shares from 3 years ago
 * Tries multiple sources in order:
 * 1. Yahoo Finance balance sheet history (primary)
 * 2. SEC filings via EDGAR API (fallback for microcaps/OTC)
 * 
 * Returns result with source indicator, or null if data is unavailable from all sources
 */
export async function fetchHistoricalOS(ticker: string): Promise<HistoricalOSResult> {
  const upperTicker = ticker.toUpperCase();

  // Try Yahoo Finance first (fastest, most reliable for listed stocks)
  const yahooResult = await fetchHistoricalOSFromYahoo(upperTicker);
  if (yahooResult !== null) {
    return { shares: yahooResult, source: 'yahoo-finance' };
  }

  // Fallback: Try SEC filings (better for microcaps, OTC, foreign issuers)
  console.log(`Yahoo Finance failed for ${upperTicker}, trying SEC filings...`);
  const secResult = await fetchHistoricalOSFromSEC(upperTicker);
  if (secResult !== null) {
    return { shares: secResult, source: 'sec' };
  }

  return { shares: null, source: 'unknown' };
}

/**
 * Fetch historical O/S from Yahoo Finance balance sheet history
 */
async function fetchHistoricalOSFromYahoo(ticker: string): Promise<number | null> {
  try {
    // Fetch balance sheet history (both quarterly and annual)
    const quoteSummary = await yahooFinance.quoteSummary(ticker, {
      modules: ["balanceSheetHistory", "balanceSheetHistoryQuarterly"],
    });

    // Calculate date 3 years ago
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    let closestBalanceSheet: any = null;
    let closestDateDiff = Infinity;

    // Check annual balance sheets first (more stable, less frequent)
    const annualStatements = quoteSummary?.balanceSheetHistory?.balanceSheetStatements || [];
    for (const statement of annualStatements) {
      if (statement.endDate) {
        const statementDate = new Date(statement.endDate);
        const diff = Math.abs(statementDate.getTime() - threeYearsAgo.getTime());
        if (diff < closestDateDiff && statementDate <= threeYearsAgo) {
          closestDateDiff = diff;
          closestBalanceSheet = statement;
        }
      }
    }

    // If no annual statement found before 3 years ago, try quarterly
    if (!closestBalanceSheet) {
      const quarterlyStatements = quoteSummary?.balanceSheetHistoryQuarterly?.balanceSheetStatements || [];
      for (const statement of quarterlyStatements) {
        if (statement.endDate) {
          const statementDate = new Date(statement.endDate);
          const diff = Math.abs(statementDate.getTime() - threeYearsAgo.getTime());
          if (diff < closestDateDiff && statementDate <= threeYearsAgo) {
            closestDateDiff = diff;
            closestBalanceSheet = statement;
          }
        }
      }
    }

    if (!closestBalanceSheet) {
      return null;
    }

    // Extract outstanding shares from the balance sheet
    // Yahoo Finance field: sharesOutstanding
    const os = closestBalanceSheet.sharesOutstanding ?? null;

    return os ? Number(os) : null;
  } catch (error) {
    console.error(`Failed to fetch historical O/S from Yahoo Finance for ${ticker}:`, error);
    return null;
  }
}

/**
 * Fetch historical O/S from SEC filings (10-K, 10-Q, DEF 14A)
 * This is a fallback for microcaps, OTC stocks, and foreign issuers where Yahoo Finance may be incomplete
 * 
 * Uses multiple fallback strategies:
 * 1. SEC XBRL API (structured data, most reliable)
 * 2. Parse raw HTML/text from filing documents (text pattern matching)
 * 3. Try multiple filing types (10-K, 10-Q, DEF 14A, 8-K, etc.)
 */
async function fetchHistoricalOSFromSEC(ticker: string): Promise<number | null> {
  try {
    // Get CIK from ticker
    const cikRes = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: {
        "User-Agent": "pump-scorecard (garthwoods@gmail.com)",
        Accept: "application/json",
      },
    });

    if (!cikRes.ok) return null;

    const cikJson = await cikRes.json();
    const entry = Object.values(cikJson).find(
      (c: any) => c.ticker?.toUpperCase() === ticker
    );

    if (!entry) return null;

    const cik = (entry as any).cik_str.toString().padStart(10, "0");

    // Get filings
    const secRes = await fetch(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
      { headers: { "User-Agent": "pump-scorecard", Accept: "application/json" } }
    );

    if (!secRes.ok) return null;

    const secJson = await secRes.json();
    const recent = secJson?.filings?.recent;

    if (!recent?.form || !Array.isArray(recent.form)) return null;

    // Calculate target date (3 years ago)
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const sixMonthsLater = new Date(threeYearsAgo);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    // Find relevant filings - prioritize 10-K, then 10-Q, then DEF 14A, then others
    const preferredForms = ['10-K', '10-Q', 'DEF 14A', '8-K', '10-K/A', '10-Q/A'];
    const candidateFilings: Array<{ date: string; accessionNumber: string; form: string; primaryDocument: string }> = [];

    for (let i = 0; i < recent.form.length; i++) {
      const form = recent.form[i];
      const filingDate = recent.filingDate[i];
      const accessionNumber = recent.accessionNumber[i];
      const primaryDocument = recent.primaryDocument[i];

      if (!form || !filingDate || !accessionNumber) continue;

      // Accept various filing types that might contain O/S info
      const isRelevantForm = preferredForms.some(pref => form.includes(pref)) ||
        form.includes('K') || form.includes('Q') || form.includes('DEF');

      if (!isRelevantForm) continue;

      const filingDateObj = new Date(filingDate);

      // Only consider filings before or near the target date
      if (filingDateObj > sixMonthsLater) continue;

      const diff = Math.abs(filingDateObj.getTime() - threeYearsAgo.getTime());
      candidateFilings.push({ date: filingDate, accessionNumber, form, primaryDocument });
    }

    // Sort by date proximity and form preference
    candidateFilings.sort((a, b) => {
      const dateDiffA = Math.abs(new Date(a.date).getTime() - threeYearsAgo.getTime());
      const dateDiffB = Math.abs(new Date(b.date).getTime() - threeYearsAgo.getTime());

      // First, prioritize by form type
      const formPriorityA = preferredForms.findIndex(pref => a.form.includes(pref));
      const formPriorityB = preferredForms.findIndex(pref => b.form.includes(pref));

      if (formPriorityA !== formPriorityB) {
        return (formPriorityA === -1 ? 999 : formPriorityA) - (formPriorityB === -1 ? 999 : formPriorityB);
      }

      // Then by date proximity
      return dateDiffA - dateDiffB;
    });

    if (candidateFilings.length === 0) {
      console.log(`No SEC filings found around 3 years ago for ${ticker}`);
      return null;
    }

    // Strategy 1: Try SEC XBRL API (structured data, most reliable)
    const xbrlResult = await tryFetchFromXBRL(cik, threeYearsAgo, sixMonthsLater, ticker);
    if (xbrlResult !== null) {
      return xbrlResult;
    }

    // Strategy 2: Parse raw filing text from HTML documents
    // Try up to 3 most relevant filings
    for (let i = 0; i < Math.min(3, candidateFilings.length); i++) {
      const filing = candidateFilings[i];
      const textResult = await tryParseFilingText(cik, filing, ticker);
      if (textResult !== null) {
        console.log(`Found historical O/S from SEC filing text (${filing.form}) for ${ticker}: ${textResult}`);
        return textResult;
      }
    }

    console.log(`All SEC parsing strategies failed for ${ticker}`);
    return null;
  } catch (error) {
    console.error(`Failed to fetch historical O/S from SEC for ${ticker}:`, error);
    return null;
  }
}

/**
 * Try to fetch O/S from SEC XBRL API
 */
async function tryFetchFromXBRL(
  cik: string,
  threeYearsAgo: Date,
  sixMonthsLater: Date,
  ticker: string
): Promise<number | null> {
  try {
    const xbrlUrl = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/EntityCommonStockSharesOutstanding.json`;

    const xbrlRes = await fetch(xbrlUrl, {
      headers: { "User-Agent": "pump-scorecard", Accept: "application/json" }
    });

    if (!xbrlRes.ok) return null;

    const xbrlData = await xbrlRes.json();

    // Try different unit types
    const unitTypes = ['shares', 'pure', 'units'];
    for (const unitType of unitTypes) {
      if (xbrlData?.units && xbrlData.units[unitType]) {
        const shares = xbrlData.units[unitType];
        let closestEntry: any = null;
        let closestDiff = Infinity;

        for (const entry of shares) {
          const entryDate = new Date(entry.end || entry.start);
          const diff = Math.abs(entryDate.getTime() - threeYearsAgo.getTime());
          if (diff < closestDiff && entryDate <= sixMonthsLater) {
            closestDiff = diff;
            closestEntry = entry;
          }
        }

        if (closestEntry && closestEntry.val) {
          const value = Number(closestEntry.val);
          // Sanity check
          if (value >= 1_000 && value <= 10_000_000_000) {
            console.log(`Found historical O/S from SEC XBRL for ${ticker}: ${value} (date: ${closestEntry.end || closestEntry.start})`);
            return value;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.log(`SEC XBRL fetch failed for ${ticker}:`, error);
    return null;
  }
}

/**
 * Try to parse O/S from raw filing text (HTML)
 */
async function tryParseFilingText(
  cik: string,
  filing: { date: string; accessionNumber: string; form: string; primaryDocument: string },
  ticker: string
): Promise<number | null> {
  try {
    const accNo = filing.accessionNumber.replace(/-/g, '');
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNo}/${filing.primaryDocument}`;

    const docRes = await fetch(docUrl, {
      headers: { "User-Agent": "pump-scorecard", Accept: "text/html,application/xhtml+xml" }
    });

    if (!docRes.ok) return null;

    const htmlText = await docRes.text();

    // Extract text content from HTML (basic extraction)
    // Remove script and style tags
    const textOnly = htmlText
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Try parsing the text
    const parsedOS = parseOSFromFilingText(textOnly, filing.date);

    if (parsedOS !== null) {
      return parsedOS;
    }

    // Also try parsing the raw HTML (sometimes numbers are in attributes or comments)
    const htmlParsed = parseOSFromFilingText(htmlText, filing.date);
    if (htmlParsed !== null) {
      return htmlParsed;
    }

    return null;
  } catch (error) {
    console.log(`Failed to parse filing text for ${ticker} (${filing.form}):`, error);
    return null;
  }
}

/**
 * Parse outstanding shares from SEC filing text
 * Uses multiple pattern matching strategies with confidence scoring
 * 
 * Common patterns in SEC filings:
 * - "As of [date], we had X shares of common stock outstanding"
 * - "X shares of common stock outstanding"
 * - "Outstanding shares: X" or "Shares outstanding: X"
 * - "Total shares outstanding X"
 * - Table formats with "Common Stock Outstanding" headers
 * - XBRL-style numeric patterns
 */
function parseOSFromFilingText(text: string, filingDate: string): number | null {
  // Enhanced patterns with better coverage
  const patterns: Array<{ pattern: RegExp; confidence: number; description: string }> = [
    // High confidence: Explicit date context with "as of" or "at"
    {
      pattern: /(?:as\s+of|as\s+of\s+[^,\.]+|at\s+[^,\.]+)[^.]{0,500}?(?:we\s+had|there\s+were|were|the\s+company\s+had|had)[^.]{0,200}?(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s*(?:million|m|billion|b|thousand|k)?\s*shares?\s*(?:of\s+(?:our\s+)?common\s+stock)?\s*outstanding/gi,
      confidence: 0.95,
      description: 'Date context with explicit statement'
    },
    // High confidence: "X shares of common stock outstanding" (most common)
    {
      pattern: /(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s*(?:million|m|billion|b)?\s*shares?\s*(?:of\s+(?:our\s+)?common\s+stock)?\s*outstanding/gi,
      confidence: 0.85,
      description: 'Direct shares outstanding statement'
    },
    // Medium-high: "Outstanding shares: X" format
    {
      pattern: /(?:outstanding\s+shares?|shares?\s+outstanding|common\s+stock\s+outstanding)[:\s]+(?:approximately\s+)?(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s*(?:million|m|billion|b|thousand|k)?/gi,
      confidence: 0.80,
      description: 'Labeled outstanding shares'
    },
    // Medium-high: "Total shares outstanding" variations
    {
      pattern: /total\s+(?:outstanding\s+)?(?:common\s+stock\s+)?shares?\s*(?:outstanding)?[:\s]+(?:approximately\s+)?(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s*(?:million|m|billion|b|thousand|k)?/gi,
      confidence: 0.80,
      description: 'Total shares outstanding'
    },
    // Medium: Table-like patterns with "Common Stock" and numbers
    {
      pattern: /common\s+stock[^.]{0,100}?(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s*(?:million|m|billion|b)?\s*(?:shares?|share\s+outstanding)/gi,
      confidence: 0.70,
      description: 'Table format common stock'
    },
    // Medium: Balance sheet style "Common Stock, X shares"
    {
      pattern: /common\s+stock[,\s]+(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s*(?:million|m|billion|b)?\s*shares?/gi,
      confidence: 0.65,
      description: 'Balance sheet format'
    },
    // Lower confidence: Any large number near "outstanding" keyword
    {
      pattern: /(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)\s*(?:million|m|billion|b)?[^.]{0,50}?outstanding[^.]{0,50}?(?:shares?|common\s+stock)/gi,
      confidence: 0.50,
      description: 'Number near outstanding keyword'
    },
    // Very specific: XBRL-style patterns in HTML
    {
      pattern: /(?:EntityCommonStockSharesOutstanding|shares\s+outstanding)[^>]*>[\s<]*(\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?)/gi,
      confidence: 0.90,
      description: 'XBRL HTML pattern'
    },
  ];

  const candidates: Array<{ value: number; confidence: number; pattern: string }> = [];

  for (const { pattern, confidence, description } of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      if (match[1]) {
        // Extract and clean number
        // Remove commas (US thousands separator)
        let numStr = match[1].replace(/,/g, '');

        // Handle periods - could be decimal point or thousands separator
        // If period is followed by 1-2 digits and then non-digit, it's likely a decimal
        // Otherwise, if multiple periods exist or period followed by 3+ digits, it's thousands separator
        const periodIndex = numStr.indexOf('.');
        if (periodIndex !== -1) {
          const afterPeriod = numStr.substring(periodIndex + 1);
          // If period followed by 3+ digits, treat as thousands separator and remove
          // Otherwise, keep as decimal point
          if (/^\d{3,}/.test(afterPeriod)) {
            numStr = numStr.replace(/\./g, '');
          }
          // Otherwise keep the decimal point (it's a valid decimal)
        }

        const context = match[0].toLowerCase();

        // Determine multiplier from context
        let multiplier = 1;
        if (context.includes('billion') || context.includes(' b ') || /\db\b/.test(context)) {
          multiplier = 1_000_000_000;
        } else if (context.includes('million') || context.includes(' m ') || /\dm\b/.test(context)) {
          multiplier = 1_000_000;
        } else if (context.includes('thousand') || context.includes(' k ') || /\dk\b/.test(context)) {
          multiplier = 1_000;
        }

        const value = parseFloat(numStr) * multiplier;

        // Sanity checks: O/S should be reasonable
        // Typical range: 1K to 100B shares (some companies have very high O/S)
        if (value >= 1_000 && value <= 100_000_000_000) {
          // Boost confidence if number appears in proximity to filing date
          let adjustedConfidence = confidence;
          const filingYear = new Date(filingDate).getFullYear();
          const yearPattern = new RegExp(`(?:${filingYear - 1}|${filingYear})`, 'i');
          if (yearPattern.test(match[0])) {
            adjustedConfidence = Math.min(confidence + 0.1, 1.0);
          }

          // Reduce confidence if number seems too small or too large for context
          if (value < 10_000 && !context.includes('thousand')) {
            adjustedConfidence *= 0.8;
          }
          if (value > 1_000_000_000 && !context.includes('billion') && !context.includes('million')) {
            adjustedConfidence *= 0.7;
          }

          candidates.push({
            value: Math.round(value),
            confidence: adjustedConfidence,
            pattern: description
          });
        }
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Sort by confidence and take the best match
  candidates.sort((a, b) => b.confidence - a.confidence);

  // If we have a high-confidence match, use it
  const bestMatch = candidates[0];
  if (bestMatch.confidence >= 0.7) {
    return bestMatch.value;
  }

  // For lower confidence, check if multiple patterns agree
  if (candidates.length >= 2) {
    const topTwo = candidates.slice(0, 2);
    const diff = Math.abs(topTwo[0].value - topTwo[1].value) / Math.max(topTwo[0].value, topTwo[1].value);
    // If values are within 5% of each other, average them
    if (diff < 0.05) {
      return Math.round((topTwo[0].value + topTwo[1].value) / 2);
    }
  }

  // Return best match if confidence is at least 0.5
  return bestMatch.confidence >= 0.5 ? bestMatch.value : null;
}

