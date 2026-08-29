// Edge-safe Upstash / Vercel KV reads via REST (no node-redis on Edge runtime).

type UpstashCreds = { url: string; token: string };

function parseUpstashCreds(): UpstashCreds | null {
  const httpsUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const httpsToken =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_REDIS_TOKEN ||
    process.env.KV_TOKEN;

  if (httpsUrl?.startsWith('https://') && httpsToken) {
    return { url: httpsUrl.replace(/\/$/, ''), token: httpsToken };
  }

  const redisUrl = process.env.KV_REST_API_REDIS_URL || process.env.KV_URL;
  if (!redisUrl?.startsWith('redis')) return null;

  try {
    const normalized = redisUrl.replace(/^rediss?:\/\//, 'http://');
    const u = new URL(normalized);
    const token = u.password || process.env.KV_REST_API_REDIS_TOKEN || process.env.KV_TOKEN;
    if (!token) return null;
    return { url: `https://${u.hostname}`, token };
  } catch {
    return null;
  }
}

/** GET a string value from Upstash REST. Returns null on miss or error. */
export async function edgeKvGet(key: string): Promise<string | null> {
  const creds = parseUpstashCreds();
  if (!creds) return null;

  try {
    const res = await fetch(`${creds.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${creds.token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string | null };
    if (json.result == null || json.result === '') return null;
    return json.result;
  } catch {
    return null;
  }
}
