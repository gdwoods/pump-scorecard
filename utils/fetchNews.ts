// utils/fetchNews.ts
/**
 * Fetch recent news headlines for a ticker using multiple sources
 * Falls back gracefully if APIs are unavailable
 */

export interface NewsItem {
  headline: string;
  date: string;
  source?: string;
  url?: string;
  publisher?: string;
}

// Format for NewsSection component (used in Pump Scorecard)
export interface NewsSectionItem {
  title: string;
  url: string;
  publisher?: string;
  published?: string | number | null;
}

/**
 * Fetch news from Yahoo Finance RSS feed
 * Free, no API key required
 */
async function fetchYahooFinanceNews(ticker: string): Promise<NewsItem[]> {
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ticker}&region=US&lang=en-US`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ShortCheck/1.0)',
      },
      // Cache for 5 minutes to avoid rate limiting
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      throw new Error(`Yahoo RSS failed: ${res.status}`);
    }

    const xmlText = await res.text();
    
    // Simple XML parsing for RSS feed
    const items: NewsItem[] = [];
    const titleMatches = xmlText.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
    const pubDateMatches = xmlText.matchAll(/<pubDate>(.*?)<\/pubDate>/g);
    
    const titles: string[] = [];
    const dates: string[] = [];
    
    for (const match of titleMatches) {
      titles.push(match[1].trim());
    }
    
    for (const match of pubDateMatches) {
      dates.push(match[1].trim());
    }
    
    // Extract links too if available
    const linkMatches = xmlText.matchAll(/<link>(.*?)<\/link>/g);
    const links: string[] = [];
    for (const match of linkMatches) {
      links.push(match[1].trim());
    }
    
    // Pair titles with dates (skip first title which is usually the feed title)
    for (let i = 1; i < titles.length && i <= dates.length; i++) {
      items.push({
        headline: titles[i],
        date: dates[i - 1] || new Date().toISOString(),
        source: 'Yahoo Finance',
        url: links[i - 1] || `https://finance.yahoo.com/quote/${ticker}/news`,
        publisher: 'Yahoo Finance',
      });
    }
    
    return items.slice(0, 20); // Limit to 20 most recent
  } catch (err) {
    console.error('Yahoo Finance news fetch failed:', err);
    return [];
  }
}

/**
 * Fetch news from Finnhub (requires API key)
 * Free tier: 60 calls/minute
 */
async function fetchFinnhubNews(ticker: string, apiKey?: string): Promise<NewsItem[]> {
  if (!apiKey) return [];
  
  try {
    const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}`;
    const res = await fetch(`${url}&token=${apiKey}`, {
      headers: {
        'User-Agent': 'ShortCheck/1.0',
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      throw new Error(`Finnhub API failed: ${res.status}`);
    }

    const json = await res.json();
    if (!Array.isArray(json)) return [];

    return json
      .slice(0, 20) // Limit to 20 most recent
      .map((item: any) => ({
        headline: item.headline || item.summary || '',
        date: item.datetime ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString(),
        source: 'Finnhub',
        url: item.url || item.weburl || '#',
        publisher: item.source || 'Finnhub',
      }))
      .filter((item: NewsItem) => item.headline.length > 0);
  } catch (err) {
    console.error('Finnhub news fetch failed:', err);
    return [];
  }
}

/**
 * Convert NewsItem[] to NewsSectionItem[] format for NewsSection component
 */
export function formatNewsForSection(newsItems: NewsItem[]): NewsSectionItem[] {
  return newsItems.map(item => ({
    title: item.headline,
    url: item.url || '#',
    publisher: item.source || item.publisher,
    published: item.date ? new Date(item.date).getTime() : null,
  }));
}

/**
 * Main function to fetch news from available sources
 * Returns most recent headlines (last 14 days)
 */
export async function fetchRecentNews(ticker: string): Promise<NewsItem[]> {
  if (!ticker || ticker.trim().length === 0) {
    return [];
  }

  const upperTicker = ticker.toUpperCase();
  const allNews: NewsItem[] = [];

  // Try Yahoo Finance first (free, no API key needed)
  try {
    const yahooNews = await fetchYahooFinanceNews(upperTicker);
    allNews.push(...yahooNews);
  } catch (err) {
    console.error('Yahoo Finance news fetch error:', err);
  }

  // Try Finnhub if API key is available (optional)
  const finnhubKey = process.env.FINNHUB_API_KEY;
  if (finnhubKey) {
    try {
      const finnhubNews = await fetchFinnhubNews(upperTicker, finnhubKey);
      // Deduplicate by headline
      const existingHeadlines = new Set(allNews.map(n => n.headline.toLowerCase()));
      finnhubNews.forEach(item => {
        if (!existingHeadlines.has(item.headline.toLowerCase())) {
          allNews.push(item);
        }
      });
    } catch (err) {
      console.error('Finnhub news fetch error:', err);
    }
  }

  // Sort by date (newest first) and limit to last 14 days
  const now = Date.now();
  const fourteenDaysAgo = now - (14 * 24 * 60 * 60 * 1000);

  return allNews
    .filter(item => {
      const itemDate = new Date(item.date).getTime();
      return itemDate >= fourteenDaysAgo;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 30); // Limit to 30 total headlines
}

/**
 * Extract the most relevant news headline for scoring
 * Returns the most recent headline, or undefined if none found
 * Filters out mechanical/administrative headlines (same keywords as scoring logic)
 */
export function getNewsForScoring(newsItems: NewsItem[]): string | undefined {
  if (!newsItems || newsItems.length === 0) {
    return undefined;
  }

  // Filter out generic/mechanical headlines (should match scoring logic)
  const filtered = newsItems.filter(item => {
    const headline = item.headline.toLowerCase();
    const genericPatterns = [
      'files 10-',
      'files 8-',
      'files form',
      'announces quarterly',
      'stock quote',
      'market data',
      'trading halted',
      'delayed quote',
      // Mechanical keywords that score as +15 (no bullish catalyst)
      'holders',
      'shareholder',
      'share count',
      'shares outstanding',
      'outstanding shares',
      'float',
      'filing',
      'form',
      'register',
      'delisted',
      'listed',
      'symbol',
      'ticker',
      'split',
      'reverse split',
      'dividend',
      'ex-dividend',
    ];
    
    return !genericPatterns.some(pattern => headline.includes(pattern));
  });

  // Return the most recent non-generic headline
  // If all headlines are mechanical, return undefined (no news = +15)
  if (filtered.length === 0) {
    return undefined;
  }

  return filtered[0].headline;
}

