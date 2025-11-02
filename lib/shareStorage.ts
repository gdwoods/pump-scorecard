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
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return null;
  }

  try {
    // Dynamic import to avoid errors if @vercel/kv is not installed
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (error) {
    // @vercel/kv not installed or not available - use fallback
    return null;
  }
}

// Save share data
export async function saveShare(shareId: string, data: ShareData): Promise<void> {
  const kv = await getKVClient();
  
  if (kv) {
    // Use Vercel KV with expiration
    const ttl = Math.floor((data.expiresAt - Date.now()) / 1000); // Convert to seconds
    await kv.setex(`share:${shareId}`, ttl, JSON.stringify(data));
    console.log(`[Share] Saved to KV: ${shareId}, expires in ${ttl}s`);
  } else {
    // Fallback to in-memory cache
    memoryCache.set(shareId, data);
    console.log(`[Share] Saved to memory: ${shareId} (cache size: ${memoryCache.size})`);
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
    const data = await kv.get<string>(`share:${shareId}`);
    if (!data) {
      console.log(`[Share] Not found in KV: ${shareId}`);
      return null;
    }
    console.log(`[Share] Retrieved from KV: ${shareId}`);
    return JSON.parse(data) as ShareData;
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

