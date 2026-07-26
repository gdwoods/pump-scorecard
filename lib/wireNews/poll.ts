// lib/wireNews/poll.ts
import { WIRE_FEEDS } from './feeds';
import { parseRssItems } from './parseRss';
import { mergeTickerNews, readTickerNews, writeTickerNews } from './kv';
import type { WireNewsItem } from './types';

async function fetchFeedXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ShortCheck/1.0 (+https://short-check.vercel.app; wire-news-poller)',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`feed ${res.status} ${url}`);
  return res.text();
}

export type PollResult = {
  feedsOk: string[];
  feedsFailed: Array<{ id: string; error: string }>;
  itemsParsed: number;
  tickersUpdated: string[];
  kvWrites: number;
};

export async function pollWireNewsFeeds(): Promise<PollResult> {
  const feedsOk: string[] = [];
  const feedsFailed: Array<{ id: string; error: string }> = [];
  const allItems: WireNewsItem[] = [];

  await Promise.all(
    WIRE_FEEDS.map(async (feed) => {
      try {
        const xml = await fetchFeedXml(feed.url);
        const items = parseRssItems(xml, feed.source);
        allItems.push(...items);
        feedsOk.push(feed.id);
      } catch (err) {
        feedsFailed.push({
          id: feed.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })
  );

  // Group by ticker
  const byTicker = new Map<string, WireNewsItem[]>();
  for (const item of allItems) {
    for (const t of item.tickers) {
      const list = byTicker.get(t) ?? [];
      list.push(item);
      byTicker.set(t, list);
    }
  }

  let kvWrites = 0;
  const tickersUpdated: string[] = [];

  for (const [ticker, items] of byTicker) {
    const incoming = items.map((it) => ({
      headline: it.headline,
      date: it.date,
      source: it.source,
      url: it.url,
    }));
    const sources = [...new Set(items.map((i) => i.source))];
    const existing = await readTickerNews(ticker);
    const merged = mergeTickerNews(existing, incoming, sources);
    const ok = await writeTickerNews(ticker, merged);
    if (ok) {
      kvWrites++;
      tickersUpdated.push(ticker);
    }
  }

  return {
    feedsOk,
    feedsFailed,
    itemsParsed: allItems.length,
    tickersUpdated: tickersUpdated.sort(),
    kvWrites,
  };
}
