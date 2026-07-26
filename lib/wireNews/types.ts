// lib/wireNews/types.ts
export type WireNewsItem = {
  headline: string;
  date: string; // ISO
  source: string;
  url: string;
  tickers: string[];
};

export type CachedTickerNews = {
  items: Array<{
    headline: string;
    date: string;
    source: string;
    url: string;
  }>;
  updatedAt: string;
  sources: string[];
};

export const NEWS_KV_PREFIX = 'news:';
export const NEWS_KV_TTL_SECONDS = 60 * 60 * 6; // 6h
export const NEWS_FRESH_MS = 30 * 60 * 1000; // treat as fresh for 30m
