import { buildNexusApiResponse } from './buildApiResponse';
import { buildNexusFilingKey } from './filingKey';
import { fetchOperatingNexusDetailed, selectNexusFilings } from './fetchOperatingNexus';
import { isUsListedCountry } from './locales';
import { addToNexusUniverse, readNexusCache, readNexusPointer, writeNexusCache } from './kv';
import { fetchSecContext, secThrottleMs, sleepMs } from './secContext';
import type { NexusApiResponse, NexusCachedPayload } from './types';

export type ComputeNexusOptions = {
  /** Skip KV read; always refresh from SEC (cron / force). */
  force?: boolean;
  /** Enroll ticker in warm universe after compute. */
  enrollUniverse?: boolean;
};

export async function computeNexusForTicker(
  ticker: string,
  options: ComputeNexusOptions = {}
): Promise<NexusApiResponse> {
  const upper = ticker.toUpperCase();
  const ctx = await fetchSecContext(upper);

  if (!ctx) {
    return buildNexusApiResponse({
      ticker: upper,
      secUnavailable: true,
    });
  }

  if (ctx.country && !isUsListedCountry(ctx.country)) {
    const response = buildNexusApiResponse({
      ticker: upper,
      country: ctx.country,
    });
    await persistResponse(upper, buildNexusFilingKey(ctx.cik, []), response, options);
    return response;
  }

  const filings = selectNexusFilings(ctx.cik, ctx.submissions);
  const filingKey = buildNexusFilingKey(ctx.cik, filings);

  if (!options.force) {
    const cached = await readNexusCache(upper, filingKey);
    if (cached?.response) {
      return cached.response;
    }
  }

  const countryForFetch = ctx.country ?? 'United States';

  if (filings.length === 0) {
    const response = buildNexusApiResponse({
      ticker: upper,
      country: countryForFetch,
      documentsUnavailable: true,
    });
    await persistResponse(upper, filingKey, response, options);
    return response;
  }

  await sleepMs(secThrottleMs());

  const fetched = await fetchOperatingNexusDetailed(
    {
      country: countryForFetch,
      cik: ctx.cik,
      submissions: ctx.submissions,
    },
    { delayBetweenDocumentsMs: secThrottleMs() }
  );

  const documentsUnavailable =
    fetched.attemptedDocuments > 0 && fetched.loadedDocuments === 0;

  const response = buildNexusApiResponse({
    ticker: upper,
    country: countryForFetch,
    documentsUnavailable,
    operatingNexus: fetched.nexus,
  });

  await persistResponse(upper, filingKey, response, options);
  return response;
}

async function persistResponse(
  ticker: string,
  filingKey: string,
  response: NexusApiResponse,
  options: ComputeNexusOptions
): Promise<void> {
  const payload: NexusCachedPayload = {
    filingKey,
    response,
    computedAt: new Date().toISOString(),
  };
  await writeNexusCache(ticker, payload);
  if (options.enrollUniverse !== false) {
    void addToNexusUniverse(ticker);
  }
}