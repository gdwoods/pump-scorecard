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
    // Dynamic import to avoid errors if @vercel/kv is not installed
    const { createClient } = await import('@vercel/kv');
    
    // Convert redis:// URLs to https:// REST API URLs
    // Vercel KV requires https:// URLs, not redis:// protocol URLs
    let kvUrl = hasUrl;
    let extractedToken = hasToken;
    
    if (kvUrl && kvUrl.startsWith('redis://')) {
      // Extract host, port, and password from redis:// URL
      // Format: redis://[username]:[password]@[host]:[port]
      const redisMatch = kvUrl.match(/^redis:\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)/);
      if (redisMatch) {
        const username = redisMatch[1]; // Usually "default"
        const password = redisMatch[2]; // This is the token!
        const host = redisMatch[3];
        const port = redisMatch[4];
        
        // Convert to Upstash REST API format: https://host:port
        kvUrl = `https://${host}:${port}`;
        
        // Extract token from password if not already provided
        if (password && !extractedToken) {
          extractedToken = password;
          console.log(`[Share] Extracted token from redis:// URL`);
        }
        
        console.log(`[Share] Converted redis:// URL to https:// REST API format: ${kvUrl.substring(0, 30)}...`);
      }
    }
    
    // @vercel/kv can work with just URL if token is embedded, or with explicit config
    const kvConfig: any = { url: kvUrl };
    if (extractedToken) {
      kvConfig.token = extractedToken;
    }
    
    const kv = createClient(kvConfig);
    
    console.log(`[Share] ✅ KV client initialized with URL=${!!kvUrl}, Token=${!!hasToken}`);
    return kv;
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
      const data = await kv.get<string>(`share:${shareId}`);
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

