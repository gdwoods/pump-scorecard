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

export async function readCachedThesis(
  body: ThesisPromptInput
): Promise<AiThesisResult | null> {
  const raw = await edgeKvGet(thesisCacheKey(body));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AiThesisResult;
  } catch {
    return null;
  }
}

export async function writeCachedThesis(
  body: ThesisPromptInput,
  thesis: AiThesisResult
): Promise<void> {
  await edgeKvSet(thesisCacheKey(body), JSON.stringify(thesis), CACHE_TTL_SECONDS);
}
