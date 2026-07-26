// lib/wireNews/kv.ts
import { getKVClient } from '@/lib/shareStorage';
import {
  NEWS_FRESH_MS,
  NEWS_KV_PREFIX,
  NEWS_KV_TTL_SECONDS,
  type CachedTickerNews,
} from './types';

function keyFor(ticker: string): string {
  return `${NEWS_KV_PREFIX}${ticker.toUpperCase()}`;
}

export async function readTickerNews(
  ticker: string
): Promise<CachedTickerNews | null> {
  const kv = await getKVClient();
  if (!kv) return null;
  try {
    const raw = await kv.get(keyFor(ticker));
    if (!raw) return null;
    if (typeof raw === 'string') return JSON.parse(raw) as CachedTickerNews;
    return raw as CachedTickerNews;
  } catch (err) {
    console.error('[wireNews] KV read failed', ticker, err);
    return null;
  }
}

export function isNewsFresh(cached: CachedTickerNews | null): boolean {
  if (!cached?.updatedAt) return false;
  const t = new Date(cached.updatedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < NEWS_FRESH_MS;
}

export async function writeTickerNews(
  ticker: string,
  cached: CachedTickerNews
): Promise<boolean> {
  const kv = await getKVClient();
  if (!kv) return false;
  try {
    await kv.set(keyFor(ticker), JSON.stringify(cached), {
      ex: NEWS_KV_TTL_SECONDS,
    });
    return true;
  } catch (err) {
    // redis client may use different set signature
    try {
      if (typeof kv.setEx === 'function') {
        await kv.setEx(keyFor(ticker), NEWS_KV_TTL_SECONDS, JSON.stringify(cached));
        return true;
      }
      await kv.set(keyFor(ticker), JSON.stringify(cached));
      return true;
    } catch (err2) {
      console.error('[wireNews] KV write failed', ticker, err2);
      return false;
    }
  }
}

/** Merge new items into existing cache, newest first, cap at 10. */
export function mergeTickerNews(
  existing: CachedTickerNews | null,
  incoming: CachedTickerNews['items'],
  sources: string[]
): CachedTickerNews {
  const byUrl = new Map<string, CachedTickerNews['items'][number]>();
  for (const it of existing?.items ?? []) {
    byUrl.set(it.url || `${it.date}|${it.headline}`, it);
  }
  for (const it of incoming) {
    byUrl.set(it.url || `${it.date}|${it.headline}`, it);
  }
  const items = [...byUrl.values()].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const sourceSet = new Set([...(existing?.sources ?? []), ...sources]);
  return {
    items: items.slice(0, 10),
    updatedAt: new Date().toISOString(),
    sources: [...sourceSet],
  };
}
