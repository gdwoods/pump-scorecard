// utils/fetchCurrentPrice.ts
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();

export interface CurrentPriceData {
  price: number | null;
  source: 'yahoo-finance';
}

/**
 * Fetch a live quote price from Yahoo Finance. Same call Short Check's
 * ticker-based tools (app/api/scan/[ticker]) already make for pricing —
 * this gives the Short Check scorer (OCR/manual entry path) the same
 * live price, since neither OCR nor manual entry currently populates
 * ExtractedData.currentPrice on its own.
 *
 * Mirrors fetchDebtCashFromYahoo's conventions: never throws, returns
 * null on any failure so callers can fall back gracefully.
 */
export async function fetchCurrentPriceFromYahoo(ticker: string): Promise<CurrentPriceData> {
  try {
    const upperTicker = ticker.toUpperCase();
    const quote = await yahooFinance.quote(upperTicker);
    const price = (quote as any)?.regularMarketPrice;
    return {
      price: typeof price === 'number' && price > 0 ? price : null,
      source: 'yahoo-finance',
    };
  } catch (error) {
    console.error(`Failed to fetch current price from Yahoo Finance for ${ticker}:`, error);
    return { price: null, source: 'yahoo-finance' };
  }
}
