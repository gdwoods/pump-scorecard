import { createHash } from 'crypto';
import { edgeKvGet, edgeKvSet } from '@/lib/kv/edgeRead';
import type { AiThesisResult } from './types';
import type { ThesisPromptInput } from './types';

const CACHE_PREFIX = 'ai-thesis:';
const CACHE_TTL_SECONDS = 24 * 60 * 60;

function stablePayload(body: ThesisPromptInput): string {
  const { ticker, shortCheck, extractedData, scan, fastVerdict } = body;
  return JSON.stringify({ ticker, shortCheck, extractedData, scan, fastVerdict });
}

export function thesisCacheKey(body: ThesisPromptInput): string {
  const hash = createHash('sha256').update(stablePayload(body)).digest('hex').slice(0, 32);
  return `${CACHE_PREFIX}${body.ticker.toUpperCase()}:${hash}`;
}

/** Per-ticker cache so group members share one thesis per symbol per day. */
export function thesisTickerCacheKey(ticker: string): string {
  return `${CACHE_PREFIX}latest:${ticker.toUpperCase()}`;
}

export type CachedThesisHit =
  | { thesis: AiThesisResult; source: 'exact' }
  | { thesis: AiThesisResult; source: 'ticker' };

function parseCachedThesis(raw: string): AiThesisResult | null {
  try {
    return JSON.parse(raw) as AiThesisResult;
  } catch {
    return null;
  }
}

export async function readCachedThesis(body: ThesisPromptInput): Promise<CachedThesisHit | null> {
  const exactRaw = await edgeKvGet(thesisCacheKey(body));
  if (exactRaw) {
    const thesis = parseCachedThesis(exactRaw);
    if (thesis) return { thesis, source: 'exact' };
  }

  const tickerRaw = await edgeKvGet(thesisTickerCacheKey(body.ticker));
  if (!tickerRaw) return null;
  const thesis = parseCachedThesis(tickerRaw);
  if (!thesis) return null;
  return { thesis, source: 'ticker' };
}

export async function writeCachedThesis(
  body: ThesisPromptInput,
  thesis: AiThesisResult
): Promise<void> {
  const serialized = JSON.stringify(thesis);
  const ticker = body.ticker.toUpperCase();
  await Promise.all([
    edgeKvSet(thesisCacheKey(body), serialized, CACHE_TTL_SECONDS),
    edgeKvSet(thesisTickerCacheKey(ticker), serialized, CACHE_TTL_SECONDS),
  ]);
}
