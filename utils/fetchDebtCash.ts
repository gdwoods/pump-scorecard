// utils/fetchDebtCash.ts
import yahooFinance from "yahoo-finance2";

export interface DebtCashData {
  debt: number | null;
  cash: number | null;
  source: 'yahoo-finance' | 'unknown';
}

/**
 * Fetch debt and cash data from Yahoo Finance balance sheet
 * Returns null values if data is unavailable
 */
export async function fetchDebtCashFromYahoo(ticker: string): Promise<DebtCashData> {
  try {
    const upperTicker = ticker.toUpperCase();

    // Fetch balance sheet data from Yahoo Finance
    const quoteSummary = await yahooFinance.quoteSummary(upperTicker, {
      modules: ["balanceSheetHistory", "balanceSheetHistoryQuarterly"],
    });

    // Try quarterly first (most recent), then annual
    let balanceSheet: any = null;

    if (quoteSummary?.balanceSheetHistoryQuarterly?.balanceSheetStatements && quoteSummary.balanceSheetHistoryQuarterly.balanceSheetStatements.length > 0) {
      // Get most recent quarterly balance sheet
      balanceSheet = quoteSummary.balanceSheetHistoryQuarterly.balanceSheetStatements[0];
    } else if (quoteSummary?.balanceSheetHistory?.balanceSheetStatements && quoteSummary.balanceSheetHistory.balanceSheetStatements.length > 0) {
      // Fall back to annual balance sheet
      balanceSheet = quoteSummary.balanceSheetHistory.balanceSheetStatements[0];
    }

    if (!balanceSheet) {
      return { debt: null, cash: null, source: 'yahoo-finance' };
    }

    // Extract cash and cash equivalents
    // Yahoo Finance fields: cash, cashAndShortTermInvestments, totalCash
    const cash = balanceSheet.cashAndShortTermInvestments ??
      balanceSheet.totalCash ??
      balanceSheet.cash ??
      null;

    // Extract total debt
    // Yahoo Finance fields: totalDebt, totalLiab (total liabilities)
    // For debt/cash ratio, we want totalDebt specifically
    const debt = balanceSheet.totalDebt ?? null;

    return {
      debt: debt ? Number(debt) : null,
      cash: cash ? Number(cash) : null,
      source: 'yahoo-finance',
    };
  } catch (error) {
    console.error(`Failed to fetch debt/cash from Yahoo Finance for ${ticker}:`, error);
    return { debt: null, cash: null, source: 'yahoo-finance' };
  }
}

