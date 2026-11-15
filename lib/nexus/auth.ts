import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

export function getConfiguredNexusApiKey(): string | null {
  const key = process.env.NEXUS_API_KEY?.trim();
  return key || null;
}

export function extractNexusApiKey(req: NextRequest): string | null {
  const header =
    req.headers.get('x-api-key')?.trim() ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    null;
  return header || null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function verifyNexusApiKey(provided: string | null): boolean {
  const expected = getConfiguredNexusApiKey();
  if (!expected) return false;
  if (!provided) return false;
  return safeEqual(provided, expected);
}