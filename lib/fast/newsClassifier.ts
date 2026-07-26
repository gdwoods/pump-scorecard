// lib/fast/newsClassifier.ts
import type { NewsClass } from './types';

export const FATAL_TERMS = [
  'fda approval',
  'fda approves',
  'receives approval',
  'definitive agreement',
  'awarded contract',
  'acquisition of',
  'to be acquired',
  'merger agreement',
  'revenue increased',
  'earnings beat',
  'raises guidance',
  'phase 3 met',
] as const;

export const WEASEL_TERMS = [
  'acceptance',
  'accepted for filing',
  'letter of intent',
  'loi',
  'mou',
  'memorandum of understanding',
  'non-binding',
  'term sheet',
  'up to $',
  'potential value',
  'intends to',
  'plans to',
  'exploring',
  'evaluating',
  'in discussions',
  'strategic review',
  'announces plans',
  'signs agreement to explore',
] as const;

export const IDEAL_TERMS = [
  'bitcoin treasury',
  'crypto treasury',
  'digital asset treasury',
  'private placement',
  'registered direct',
  'strategic investment',
  'ai partnership',
  'quantum',
  'blockchain initiative',
] as const;

function findMatches(text: string, terms: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return terms.filter((t) => lower.includes(t));
}

export function classifyNewsHeadline(headline: string | null | undefined): {
  class: NewsClass;
  matchedTerms: { fatal: string[]; weasel: string[]; ideal: string[] };
} {
  if (!headline || !headline.trim()) {
    return {
      class: 'NONE',
      matchedTerms: { fatal: [], weasel: [], ideal: [] },
    };
  }

  const fatal = findMatches(headline, FATAL_TERMS);
  const weasel = findMatches(headline, WEASEL_TERMS);
  const ideal = findMatches(headline, IDEAL_TERMS);

  let newsClass: NewsClass = 'NEUTRAL';
  if (fatal.length > 0 && weasel.length === 0) {
    newsClass = 'FATAL';
  } else if (ideal.length > 0) {
    newsClass = 'IDEAL';
  } else if (fatal.length > 0 && weasel.length > 0) {
    newsClass = 'NEUTRAL'; // REVIEW + flag at walk-away layer
  }

  return { class: newsClass, matchedTerms: { fatal, weasel, ideal } };
}
