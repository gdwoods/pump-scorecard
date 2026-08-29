import type { ExtractedData } from '@/lib/shortCheckTypes';
import {
  fetchCurrentPriceFromYahoo,
  type CurrentPriceData,
} from '@/utils/fetchCurrentPrice';

export type CurrentPriceFetcher = (ticker: string) => Promise<CurrentPriceData>;

/**
 * Populate ExtractedData.currentPrice from a live quote when OCR/manual
 * entry did not capture a dollar price (needed for baby-shelf §3.3 math).
 * Never throws — callers proceed with partial data on failure.
 */
export async function applyCurrentPriceFallback(
  extractedData: ExtractedData,
  fetchPrice: CurrentPriceFetcher = fetchCurrentPriceFromYahoo
): Promise<void> {
  if (extractedData.currentPrice !== undefined || !extractedData.ticker) {
    return;
  }

  try {
    const priceData = await fetchPrice(extractedData.ticker);
    if (priceData.price !== null) {
      extractedData.currentPrice = priceData.price;
      extractedData.currentPriceSource = priceData.source;
    }
  } catch {
    // Continue without a live price — same pattern as debt/cash and news fetches.
  }
}
