import axios from "axios";
import {
  fetchFilingXml,
  parseForm144Xml,
  parseForm4Xml,
  type ParsedInsiderRow,
} from "./parseSecInsiderForms";

export interface InsiderTransaction {
  date: string; // ISO date (YYYY-MM-DD)
  transactionType: 'buy' | 'sell' | 'other' | 'intent_to_sell';
  shares: number;
  pricePerShare: number;
  totalValue: number;
  insiderName: string;
  insiderTitle: string;
  formType: string; // '4', '4/A', '144', etc.
  filingUrl: string;
  transactionCode?: string;
  accessionNumber?: string;
}

const SEC_HEADERS = {
  'User-Agent': 'Short-Check App admin@short-check.com',
  'Accept': 'application/json',
};

const INSIDER_FORMS = new Set(['4', '4/A', '144', '144/A']);

function toInsiderTransaction(
  row: ParsedInsiderRow,
  filingUrl: string,
  accessionNumber: string
): InsiderTransaction {
  return {
    date: row.date,
    transactionType: row.transactionType,
    shares: row.shares,
    pricePerShare: row.pricePerShare,
    totalValue: row.totalValue,
    insiderName: row.insiderName,
    insiderTitle: row.insiderTitle,
    formType: row.formType,
    filingUrl,
    transactionCode: row.transactionCode,
    accessionNumber,
  };
}

function stubFromFiling(
  form: string,
  filingDate: string,
  filingUrl: string,
  accessionNumber: string
): InsiderTransaction {
  const is144 = form.startsWith('144');
  return {
    date: filingDate,
    transactionType: is144 ? 'intent_to_sell' : 'other',
    shares: 0,
    pricePerShare: 0,
    totalValue: 0,
    insiderName: 'See Filing',
    insiderTitle: is144 ? 'Proposed seller' : 'Insider',
    formType: form,
    filingUrl,
    accessionNumber,
  };
}

/**
 * Fetch insider transactions from SEC EDGAR (Form 4 + Form 144).
 * Form 4 XML is parsed for share counts and prices when available.
 * Form 144 captures filed intent-to-sell before the sale completes.
 */
export async function fetchInsiderTransactions(
  ticker: string
): Promise<InsiderTransaction[]> {
  const timeoutPromise = new Promise<InsiderTransaction[]>((resolve) => {
    setTimeout(() => {
      console.log(`[Insider] Timeout reached for ${ticker}`);
      resolve([]);
    }, 12000);
  });

  const fetchPromise = (async (): Promise<InsiderTransaction[]> => {
    try {
      console.log(`[Insider] Fetching Form 4 / 144 filings for ${ticker}...`);
      const startTime = Date.now();

      const tickersResponse = await axios.get(
        'https://www.sec.gov/files/company_tickers.json',
        { headers: SEC_HEADERS, timeout: 3000 }
      );

      const companies = Object.values(tickersResponse.data) as Array<{
        ticker?: string;
        cik_str?: number;
      }>;
      const company = companies.find(
        (c) => c.ticker?.toUpperCase() === ticker.toUpperCase()
      );

      if (!company?.cik_str) {
        console.log(`[Insider] No CIK found for ${ticker}`);
        return [];
      }

      const cik = String(company.cik_str).padStart(10, '0');

      const submissionsResponse = await axios.get(
        `https://data.sec.gov/submissions/CIK${cik}.json`,
        { headers: SEC_HEADERS, timeout: 3000 }
      );

      const filings = submissionsResponse.data.filings?.recent;
      if (!filings) {
        console.log(`[Insider] No filings found for ${ticker}`);
        return [];
      }

      const transactions: InsiderTransaction[] = [];
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const candidates: Array<{
        form: string;
        filingDate: string;
        accessionNumber: string;
        primaryDocument: string;
      }> = [];

      for (let i = 0; i < filings.form.length; i++) {
        const form = filings.form[i] as string;
        if (!INSIDER_FORMS.has(form)) continue;
        const filingDate = filings.filingDate[i] as string;
        if (new Date(filingDate) < oneYearAgo) continue;
        candidates.push({
          form,
          filingDate,
          accessionNumber: filings.accessionNumber[i] as string,
          primaryDocument: (filings.primaryDocument?.[i] as string) || '',
        });
        if (candidates.length >= 25) break;
      }

      let parsedCount = 0;
      const maxParse = 8;

      for (const cand of candidates) {
        const filingUrl = `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${cik}&accession_number=${cand.accessionNumber}&xbrl_type=v`;

        if (!cand.primaryDocument || parsedCount >= maxParse) {
          transactions.push(stubFromFiling(cand.form, cand.filingDate, filingUrl, cand.accessionNumber));
          continue;
        }

        const xml = await fetchFilingXml(cik, cand.accessionNumber, cand.primaryDocument);
        parsedCount++;

        if (!xml) {
          transactions.push(stubFromFiling(cand.form, cand.filingDate, filingUrl, cand.accessionNumber));
          continue;
        }

        const is144 = cand.form.startsWith('144');
        const rows = is144
          ? parseForm144Xml(xml, cand.filingDate)
          : parseForm4Xml(xml, cand.filingDate);

        if (rows.length === 0) {
          transactions.push(stubFromFiling(cand.form, cand.filingDate, filingUrl, cand.accessionNumber));
          continue;
        }

        for (const row of rows) {
          transactions.push(toInsiderTransaction(row, filingUrl, cand.accessionNumber));
        }
      }

      transactions.sort((a, b) => b.date.localeCompare(a.date));

      console.log(
        `[Insider] Found ${transactions.length} insider rows for ${ticker} in ${Date.now() - startTime}ms`
      );
      return transactions.slice(0, 30);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Insider] Error for ${ticker}:`, msg);
      return [];
    }
  })();

  return Promise.race([fetchPromise, timeoutPromise]);
}
