import { getKVClient } from '@/lib/shareStorage';
import { edgeKvGet } from '@/lib/kv/edgeRead';
import type { NexusCachedPayload } from './types';
import { NEXUS_KV_PREFIX, NEXUS_UNIVERSE_KEY } from './types';

export function nexusCacheTtlSeconds(): number {
  const raw = process.env.NEXUS_CACHE_TTL_DAYS?.trim();
  const days = raw ? Number.parseInt(raw, 10) : 21;
  if (!Number.isFinite(days) || days < 1) return 21 * 86400;
  return days * 86400;
}

function dataKey(ticker: string, filingKey: string): string {
  return `${NEXUS_KV_PREFIX}${ticker.toUpperCase()}:${filingKey}`;
}

function pointerKey(ticker: string): string {
  return `${NEXUS_KV_PREFIX}ptr:${ticker.toUpperCase()}`;
}

export async function readNexusCache(
  ticker: string,
  filingKey: string
): Promise<NexusCachedPayload | null> {
  const key = dataKey(ticker, filingKey);

  try {
    const rawEdge = await edgeKvGet(key);
    if (rawEdge) {
      const parsed = JSON.parse(rawEdge) as NexusCachedPayload;
      if (parsed?.response?.ticker && parsed.filingKey === filingKey) return parsed;
    }
  } catch {
    // fall through to node client
  }

  const kv = await getKVClient();
  if (!kv) return null;
  try {
    const raw = await kv.get(key);
    if (!raw) return null;
    const parsed =
      typeof raw === 'string' ? (JSON.parse(raw) as NexusCachedPayload) : (raw as NexusCachedPayload);
    if (parsed?.response?.ticker && parsed.filingKey === filingKey) return parsed;
    return null;
  } catch (err) {
    console.error('[nexus] KV read failed', ticker, err);
    return null;
  }
}

/** Read pointer to learn last filing key without loading the full payload. */
export async function readNexusPointer(ticker: string): Promise<string | null> {
  const key = pointerKey(ticker);
  const kv = await getKVClient();
  if (!kv) return null;
  try {
    const raw = await kv.get(key);
    if (!raw) return null;
    return typeof raw === 'string' ? raw : String(raw);
  } catch {
    return null;
  }
}

export async function writeNexusCache(
  ticker: string,
  payload: NexusCachedPayload
): Promise<boolean> {
  const kv = await getKVClient();
  if (!kv) return false;
  const ttl = nexusCacheTtlSeconds();
  const key = dataKey(ticker, payload.filingKey);
  const ptr = pointerKey(ticker);
  const body = JSON.stringify(payload);
  try {
    await kv.set(key, body, { ex: ttl });
    try {
      await kv.set(ptr, payload.filingKey, { ex: ttl });
    } catch {
      if (typeof kv.setEx === 'function') {
        await kv.setEx(ptr, ttl, payload.filingKey);
      }
    }
    return true;
  } catch (err) {
    console.error('[nexus] KV write failed', ticker, err);
    return false;
  }
}

export function parsePartnerTickers(): string[] {
  const raw =
    process.env.NEXUS_PARTNER_TICKERS?.trim() || process.env.DROPPINESS_WATCHLIST?.trim() || '';
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(t));
}

export async function readNexusUniverse(): Promise<string[]> {
  const kv = await getKVClient();
  if (!kv) return [];
  try {
    const raw = await kv.get(NEXUS_UNIVERSE_KEY);
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t) => String(t).toUpperCase())
      .filter((t) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(t));
  } catch (err) {
    console.error('[nexus] universe read failed', err);
    return [];
  }
}

export async function addToNexusUniverse(ticker: string): Promise<void> {
  const upper = ticker.toUpperCase();
  const kv = await getKVClient();
  if (!kv) return;
  try {
    const existing = await readNexusUniverse();
    if (existing.includes(upper)) return;
    const next = [upper, ...existing].slice(0, 400);
    const ttl = 90 * 86400;
    const payload = JSON.stringify(next);
    try {
      await kv.set(NEXUS_UNIVERSE_KEY, payload, { ex: ttl });
    } catch {
      if (typeof kv.setEx === 'function') {
        await kv.setEx(NEXUS_UNIVERSE_KEY, ttl, payload);
      } else {
        await kv.set(NEXUS_UNIVERSE_KEY, payload);
      }
    }
  } catch (err) {
    console.error('[nexus] universe write failed', err);
  }
}