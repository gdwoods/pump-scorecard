// lib/shareStorage.ts
// Storage abstraction for shareable links
// Uses Vercel KV if available, otherwise falls back to in-memory cache (development only)

interface ShareData {
  ticker: string;
  extractedData: any;
  result: any;
  createdAt: number;
  expiresAt: number;
}

// In-memory cache for development (not persistent across deployments)
const memoryCache = new Map<string, ShareData>();

// Cache Redis client to avoid reconnecting
let cachedRedisClient: any = null;
let cachedClientType: 'redis' | 'vercel-kv' | null = null;

// Generate a unique share ID
export function generateShareId(): string {
  // Generate a URL-safe random ID (12 characters)
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Get Vercel KV client (if available)
async function getKVClient() {
  // Check for Vercel KV environment variables
  // Vercel creates different variable names depending on how KV is connected
  // With custom prefix "KV_REST_API": KV_REST_API_REDIS_URL (sometimes just KV_REST_API_URL for token)
  // Default: KV_URL and KV_TOKEN
  const redisUrl = process.env.KV_REST_API_REDIS_URL;

  // Try multiple possible token variable names
  const redisToken = process.env.KV_REST_API_REDIS_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.KV_TOKEN;

  // Also check for standard naming (without _REDIS suffix)
  const hasUrl = redisUrl || process.env.KV_REST_API_URL || process.env.KV_URL;
  const hasToken = redisToken || process.env.KV_REST_API_TOKEN || process.env.KV_TOKEN;

  if (!hasUrl) {
    console.log(`[Share] KV not configured: No URL found. Checked: KV_REST_API_REDIS_URL, KV_REST_API_URL, KV_URL`);
    return null;
  }

  if (!hasToken) {
    console.warn(`[Share] KV URL found but no token. Checked: KV_REST_API_REDIS_TOKEN, KV_REST_API_TOKEN, KV_TOKEN`);
    console.warn(`[Share] Attempting to connect without explicit token (KV might have token embedded in URL)`);
  }

  try {
    // Check if URL is redis:// (Redis Cloud) or https:// (Upstash/Vercel KV)
    if (hasUrl && hasUrl.startsWith('redis://')) {
      // Return cached client if available
      if (cachedRedisClient && cachedClientType === 'redis') {
        console.log(`[Share] Using cached Redis client`);
        return cachedRedisClient;
      }

      // Use native Redis client for redis:// URLs (Redis Cloud)
      console.log(`[Share] Detected redis:// URL - using native Redis client`);
      try {
        const { createClient } = await import('redis');

        // Try non-TLS first (since URL is redis://, not rediss://)
        let redisClient: any = null;

        // First attempt: non-TLS connection (redis://)
        try {
          console.log(`[Share] Attempting non-TLS connection to Redis Cloud...`);
          redisClient = createClient({
            url: hasUrl,
          });
          await redisClient.connect();
          console.log(`[Share] ✅ Redis Cloud non-TLS connection successful`);
        } catch (nonTlsError: any) {
          console.log(`[Share] Non-TLS connection failed, trying TLS:`, nonTlsError?.message);
          // Try TLS connection (rediss://)
          try {
            redisClient = createClient({
              url: hasUrl.replace(/^redis:\/\//, 'rediss://'),
              socket: {
                tls: true,
                rejectUnauthorized: false, // Redis Cloud may use self-signed certs
              },
            });
            await redisClient.connect();
            console.log(`[Share] ✅ Redis Cloud TLS connection successful`);
          } catch (tlsError: any) {
            console.error(`[Share] ❌ Both non-TLS and TLS connections failed`);
            console.error(`[Share] Non-TLS error:`, nonTlsError?.message);
            console.error(`[Share] TLS error:`, tlsError?.message);
            throw tlsError;
          }
        }

        // Wrap in a compatible interface
        const wrappedClient = {
          get: async (key: string) => {
            try {
              const value = await redisClient.get(key);
              return value;
            } catch (err: any) {
              // Reconnect if connection lost
              if (err.message?.includes('Connection') || err.message?.includes('closed')) {
                console.log(`[Share] Reconnecting Redis client...`);
                await redisClient.connect();
                return await redisClient.get(key);
              }
              throw err;
            }
          },
          setex: async (key: string, seconds: number, value: string) => {
            try {
              await redisClient.setEx(key, seconds, value);
            } catch (err: any) {
              // Reconnect if connection lost
              if (err.message?.includes('Connection') || err.message?.includes('closed')) {
                console.log(`[Share] Reconnecting Redis client...`);
                await redisClient.connect();
                await redisClient.setEx(key, seconds, value);
              } else {
                throw err;
              }
            }
          },
          del: async (key: string) => {
            try {
              await redisClient.del(key);
            } catch (err: any) {
              // Reconnect if connection lost
              if (err.message?.includes('Connection') || err.message?.includes('closed')) {
                console.log(`[Share] Reconnecting Redis client...`);
                await redisClient.connect();
                await redisClient.del(key);
              } else {
                throw err;
              }
            }
          },
        } as any;

        // Cache the client
        cachedRedisClient = wrappedClient;
        cachedClientType = 'redis';

        return wrappedClient;
      } catch (redisError: any) {
        console.error(`[Share] ❌ Redis client failed:`, redisError?.message || redisError);
        return null;
      }
    } else {
      // Return cached client if available
      if (cachedRedisClient && cachedClientType === 'vercel-kv') {
        console.log(`[Share] Using cached Vercel KV client`);
        return cachedRedisClient;
      }

      // Use @vercel/kv for https:// URLs (Upstash/Vercel KV)
      const { createClient } = await import('@vercel/kv');

      const kvConfig: any = { url: hasUrl };
      if (hasToken) {
        kvConfig.token = hasToken;
      }

      const kv = createClient(kvConfig);

      // Cache the client
      cachedRedisClient = kv;
      cachedClientType = 'vercel-kv';

      console.log(`[Share] ✅ Vercel KV client initialized with URL=${!!hasUrl}, Token=${!!hasToken}`);
      return kv;
    }
  } catch (error: any) {
    // @vercel/kv not installed or not available - use fallback
    console.error(`[Share] ❌ KV import/init failed:`, error?.message || error);
    return null;
  }
}

// Save share data
export async function saveShare(shareId: string, data: ShareData): Promise<void> {
  const kv = await getKVClient();

  if (kv) {
    try {
      // Use Vercel KV with expiration
      const ttl = Math.floor((data.expiresAt - Date.now()) / 1000); // Convert to seconds
      await kv.setex(`share:${shareId}`, ttl, JSON.stringify(data));
      console.log(`[Share] ✅ Saved to KV: ${shareId}, expires in ${ttl}s (${Math.floor(ttl / 86400)} days)`);
    } catch (error: any) {
      console.error(`[Share] ❌ Failed to save to KV: ${error?.message || error}`);
      throw error; // Re-throw to let caller know save failed
    }
  } else {
    // Fallback to in-memory cache
    memoryCache.set(shareId, data);
    console.warn(`[Share] ⚠️ Saved to memory (NOT PERSISTENT): ${shareId} (cache size: ${memoryCache.size})`);
    // Auto-expire from memory after expiration time
    setTimeout(() => {
      memoryCache.delete(shareId);
      console.log(`[Share] Expired from memory: ${shareId}`);
    }, data.expiresAt - Date.now());
  }
}

// Retrieve share data
export async function getShare(shareId: string): Promise<ShareData | null> {
  const kv = await getKVClient();

  if (kv) {
    try {
      const data = await kv.get(`share:${shareId}`);
      if (!data) {
        console.log(`[Share] ❌ Not found in KV: ${shareId}`);
        return null;
      }
      console.log(`[Share] ✅ Retrieved from KV: ${shareId}`);
      return JSON.parse(data) as ShareData;
    } catch (error: any) {
      console.error(`[Share] ❌ Error retrieving from KV: ${error?.message || error}`);
      return null;
    }
  } else {
    const data = memoryCache.get(shareId);
    console.log(`[Share] Looking in memory: ${shareId}, found: ${!!data}, cache size: ${memoryCache.size}`);
    if (!data) {
      // Log all keys in cache for debugging
      const keys = Array.from(memoryCache.keys());
      console.log(`[Share] Available keys in memory: ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? `... (${keys.length} total)` : ''}`);
      return null;
    }
    // Check if expired
    if (data.expiresAt < Date.now()) {
      console.log(`[Share] Expired: ${shareId} (expired at ${new Date(data.expiresAt).toISOString()}, now ${new Date().toISOString()})`);
      memoryCache.delete(shareId);
      return null;
    }
    console.log(`[Share] Retrieved from memory: ${shareId}`);
    return data;
  }
}

// Delete share data (cleanup)
export async function deleteShare(shareId: string): Promise<void> {
  const kv = await getKVClient();

  if (kv) {
    await kv.del(`share:${shareId}`);
  } else {
    memoryCache.delete(shareId);
  }
}

