import type { ClaimTag, TaggedClaim } from './types';
import { CLAIM_TAG_LABELS } from './types';

const INLINE_TAG_RE = /^(VERIFY|CONFLICT|OPINION)\s*:\s*/i;

/** Prefix for inline LLM / prose markers (CELU-style). */
export function claimTagInlinePrefix(tag: Exclude<ClaimTag, 'verified'>): string {
  return `${CLAIM_TAG_LABELS[tag]}: `;
}

export function parseInlineClaimTag(text: string): { tag: ClaimTag; body: string } {
  const match = text.trim().match(INLINE_TAG_RE);
  if (!match) return { tag: 'verified', body: text.trim() };
  const raw = match[1].toUpperCase();
  const tag = raw === 'VERIFY' ? 'verify' : raw === 'CONFLICT' ? 'conflict' : 'opinion';
  return { tag, body: text.trim().slice(match[0].length).trim() };
}

export function formatTaggedClaimInline(claim: TaggedClaim): string {
  const tag = claim.tag ?? 'verified';
  if (tag === 'verified') {
    return claim.conflictNote ? `${claim.text} (CONFLICT: ${claim.conflictNote})` : claim.text;
  }
  return `${claimTagInlinePrefix(tag)}${claim.text}`;
}

export function formatTaggedClaimPlain(claim: TaggedClaim): string {
  return formatTaggedClaimInline(claim);
}

export function normalizeTaggedClaims(
  items: Array<string | TaggedClaim | null | undefined>
): TaggedClaim[] {
  const out: TaggedClaim[] = [];
  for (const item of items) {
    if (!item) continue;
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const { tag, body } = parseInlineClaimTag(trimmed);
      out.push({ text: body, tag });
      continue;
    }
    if (item.text?.trim()) {
      out.push({
        ...item,
        text: item.text.trim(),
        tag: item.tag ?? 'verified',
      });
    }
  }
  return out;
}
