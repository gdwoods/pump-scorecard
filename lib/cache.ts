// lib/cache.ts

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheConfig {
  defaultTTL: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of entries
}

class APICache {
  private cache = new Map<string, CacheEntry<any>>();
  private config: CacheConfig;

  constructor(config: CacheConfig = { defaultTTL: 5 * 60 * 1000, maxSize: 100 }) {
    this.config = config;
  }

  set<T>(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    const expiresAt = now + (ttl || this.config.defaultTTL);

    // Remove expired entries before adding new one
    this.cleanup();

    // If cache is full, remove oldest entry
    if (this.cache.size >= this.config.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: Date.now() - entry.timestamp,
        expiresIn: entry.expiresAt - Date.now(),
      })),
    };
  }
}

// Create cache instances for different data types
export const tickerCache = new APICache({
  defaultTTL: 5 * 60 * 1000, // 5 minutes for ticker data
  maxSize: 50,
});

export const fundamentalsCache = new APICache({
  defaultTTL: 10 * 60 * 1000, // 10 minutes for fundamentals
  maxSize: 100,
});

export const historyCache = new APICache({
  defaultTTL: 2 * 60 * 1000, // 2 minutes for price history
  maxSize: 30,
});

// Cache key generators
export const getTickerCacheKey = (ticker: string) => `ticker:${ticker.toUpperCase()}`;
export const getFundamentalsCacheKey = (ticker: string) => `fundamentals:${ticker.toUpperCase()}`;
export const getHistoryCacheKey = (ticker: string) => `history:${ticker.toUpperCase()}`;

// Cache utilities
export const isCacheValid = (cache: APICache, key: string): boolean => {
  return cache.has(key);
};

export const getCachedData = <T>(cache: APICache, key: string): T | null => {
  return cache.get<T>(key);
};

export const setCachedData = <T>(cache: APICache, key: string, data: T, ttl?: number): void => {
  cache.set(key, data, ttl);
};
