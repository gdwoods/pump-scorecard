// lib/ai/correctThesisMislabels.ts
//
// Post-parse guardrails when the model mislabels soft fast flags (especially W2).

const W2_SOFT_FLAG_NOTE =
  'Soft flag W2:todayMove — move is below the discretionary 30%+ pump-day threshold (not a binding walk-away).';

function mentionsW2Mislabel(text: string): boolean {
  if (!/W2:todayMove/i.test(text)) return false;
  if (/bind(?:ing)?\s+(?:walk[\-\s]?away\s+)?(?:flag\s+)?W2|W2:todayMove.*(?:bind|walk[\-\s]?away|veto)/i.test(text)) {
    return true;
  }
  if (/W2:todayMove.*exceeds/i.test(text)) return true;
  if (/manipulation risk.*W2|W2.*manipulation risk/i.test(text)) return true;
  return false;
}

export function correctW2SoftFlagMislabel(text: string | undefined): string | undefined {
  if (!text?.trim()) return text;
  if (!mentionsW2Mislabel(text)) return text;
  return W2_SOFT_FLAG_NOTE;
}

export function sanitizeThesisTextFields<T extends Record<string, unknown>>(fields: T): T {
  const out = { ...fields };
  for (const key of ['summary', 'thesis', 'regulatoryAlert', 'rubricNarrative', 'ceoLens', 'traderLens'] as const) {
    const val = out[key];
    if (typeof val === 'string') {
      const fixed = correctW2SoftFlagMislabel(val);
      if (fixed !== val) (out as Record<string, unknown>)[key] = fixed;
    }
  }
  if (Array.isArray(out.keyRisks)) {
    out.keyRisks = (out.keyRisks as string[]).map(
      (r) => correctW2SoftFlagMislabel(r) ?? r
    ) as T['keyRisks'];
  }
  return out;
}
