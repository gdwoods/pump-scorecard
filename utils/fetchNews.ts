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
    
    // Parse RSS feed by extracting items
    const items: NewsItem[] = [];
    
    // Match each <item> block
    const itemMatches = xmlText.matchAll(/<item>(.*?)<\/item>/gs);
    
    for (const itemMatch of itemMatches) {
      const itemContent = itemMatch[1];
      
      // Extract title (handle both CDATA and plain text)
      const titleMatch = itemContent.match(/<title>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/s);
      if (!titleMatch) continue;
      
      const headline = (titleMatch[1] || titleMatch[2] || '').trim();
      if (!headline) continue;
      
      // Extract link
      const linkMatch = itemContent.match(/<link>(.*?)<\/link>/s);
      const url = linkMatch ? linkMatch[1].trim() : `https://finance.yahoo.com/quote/${ticker}/news`;
      
      // Extract pubDate (RFC 822 format: "Sat, 10 Jan 2026 00:43:00 +0000")
      const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/s);
      let dateStr = pubDateMatch ? pubDateMatch[1].trim() : new Date().toISOString();
      
      // Convert RFC 822 date to ISO string
      let date: Date;
      try {
        date = new Date(dateStr);
        // If date parsing fails, use current date
        if (isNaN(date.getTime())) {
          date = new Date();
        }
      } catch {
        date = new Date();
      }
      
      items.push({
        headline,
        date: date.toISOString(),
        source: 'Yahoo Finance',
        url,
        publisher: 'Yahoo Finance',
      });
    }
    
    const result = items.slice(0, 20); // Limit to 20 most recent
    console.log(`[News] Yahoo Finance: Found ${result.length} news items for ${ticker}`);
    return result;
  } catch (err) {
    console.error(`[News] Yahoo Finance news fetch failed for ${ticker}:`, err);
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
    console.log(`[News] Added ${yahooNews.length} items from Yahoo Finance for ${upperTicker}`);
  } catch (err) {
    console.error(`[News] Yahoo Finance news fetch error for ${upperTicker}:`, err);
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

  const filtered = allNews
    .filter(item => {
      const itemDate = new Date(item.date).getTime();
      return itemDate >= fourteenDaysAgo;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 30); // Limit to 30 total headlines
  
  console.log(`[News] Returning ${filtered.length} filtered news items for ${upperTicker} (from ${allNews.length} total, filtered to last 14 days)`);
  return filtered;
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

