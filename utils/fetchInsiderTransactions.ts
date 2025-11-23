import axios from "axios";

export interface InsiderTransaction {
    date: string; // ISO date (YYYY-MM-DD)
    transactionType: 'buy' | 'sell' | 'other';
    shares: number;
    pricePerShare: number;
    totalValue: number;
    insiderName: string;
    insiderTitle: string;
    formType: string; // '4', '4/A', etc.
    filingUrl: string; // Link to SEC filing
}

/**
 * Fetch insider transaction FILING DATES from SEC EDGAR (free)
 * Note: This returns filing dates only, not transaction details
 * Full transaction details would require parsing XML files
 */
export async function fetchInsiderTransactions(
    ticker: string
): Promise<InsiderTransaction[]> {
    const timeoutPromise = new Promise<InsiderTransaction[]>((resolve) => {
        setTimeout(() => {
            console.log(`[Insider] Timeout reached for ${ticker}`);
            resolve([]);
        }, 5000);
    });

    const fetchPromise = (async (): Promise<InsiderTransaction[]> => {
        try {
            console.log(`[Insider] Fetching Form 4 filings for ${ticker}...`);
            const startTime = Date.now();

            // SEC requires a User-Agent header
            const headers = {
                'User-Agent': 'Short-Check App admin@short-check.com',
                'Accept': 'application/json',
            };

            // Step 1: Get company CIK from ticker
            const tickersResponse = await axios.get(
                'https://www.sec.gov/files/company_tickers.json',
                { headers, timeout: 3000 }
            );

            const companies = Object.values(tickersResponse.data) as any[];
            const company = companies.find(
                (c) => c.ticker?.toUpperCase() === ticker.toUpperCase()
            );

            if (!company) {
                console.log(`[Insider] No CIK found for ${ticker}`);
                return [];
            }

            const cik = String(company.cik_str).padStart(10, '0');

            // Step 2: Get company submissions
            const submissionsResponse = await axios.get(
                `https://data.sec.gov/submissions/CIK${cik}.json`,
                { headers, timeout: 3000 }
            );

            const filings = submissionsResponse.data.filings?.recent;
            if (!filings) {
                console.log(`[Insider] No filings found for ${ticker}`);
                return [];
            }

            // Step 3: Filter for Form 4 filings (last 12 months)
            const transactions: InsiderTransaction[] = [];
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            for (let i = 0; i < filings.form.length; i++) {
                const form = filings.form[i];
                const filingDate = filings.filingDate[i];
                const accessionNumber = filings.accessionNumber[i];

                if (form !== '4' && form !== '4/A') continue;
                if (new Date(filingDate) < oneYearAgo) continue;

                // Build SEC filing URL
                const accessionNum = accessionNumber.replace(/-/g, '');
                const filingUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=100`;

                transactions.push({
                    date: filingDate,
                    transactionType: 'other', // Unknown without parsing XML
                    shares: 0,
                    pricePerShare: 0,
                    totalValue: 0,
                    insiderName: 'See Filing',
                    insiderTitle: 'Insider',
                    formType: form,
                    filingUrl: filingUrl,
                });

                if (transactions.length >= 20) break;
            }

            console.log(`[Insider] Found ${transactions.length} Form 4 filings for ${ticker} in ${Date.now() - startTime}ms`);
            return transactions;

        } catch (error: any) {
            console.error(`[Insider] Error for ${ticker}:`, error.message);
            return [];
        }
    })();

    return Promise.race([fetchPromise, timeoutPromise]);
}
