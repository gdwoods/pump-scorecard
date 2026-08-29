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

async function upstashFetch(
  creds: UpstashCreds,
  command: string
): Promise<{ result?: unknown; error?: string } | null> {
  try {
    const res = await fetch(`${creds.url}/${command}`, {
      headers: { Authorization: `Bearer ${creds.token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as { result?: unknown; error?: string };
  } catch {
    return null;
  }
}

/** GET a string value from Upstash REST. Returns null on miss or error. */
export async function edgeKvGet(key: string): Promise<string | null> {
  const creds = parseUpstashCreds();
  if (!creds) return null;

  const json = await upstashFetch(creds, `get/${encodeURIComponent(key)}`);
  if (!json || json.result == null || json.result === '') return null;
  return String(json.result);
}

/** INCR a counter. Returns null when KV is unavailable or the command fails. */
export async function edgeKvIncr(key: string): Promise<number | null> {
  const creds = parseUpstashCreds();
  if (!creds) return null;

  const json = await upstashFetch(creds, `incr/${encodeURIComponent(key)}`);
  if (json?.result == null || typeof json.result !== 'number') return null;
  return json.result;
}

/** EXPIRE a key after `seconds`. Returns false on failure or when KV is unavailable. */
export async function edgeKvExpire(key: string, seconds: number): Promise<boolean> {
  const creds = parseUpstashCreds();
  if (!creds) return false;

  const json = await upstashFetch(creds, `expire/${encodeURIComponent(key)}/${seconds}`);
  return json?.result === 1;
}
