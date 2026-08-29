// lib/babyShelf.ts
// Short Check adapter over the existing Framework 3.0 §3.3 baby-shelf
// calculation (Form S-3 Instr. I.B.6) in lib/fast/babyShelf.ts — the Fast
// Scan endpoint already computes this; the Short Check scorer previously
// didn't and relied entirely on an OCR'd offering-ability badge instead.
//
// This adapter exists only to bridge ExtractedData's OCR-era conventions
// (share counts <1000 mean millions; burn is negative) to computeBabyShelf's
// plain-number inputs, and to add a Short-Check-flavored display string.
// The actual §3.3 math lives in ONE place: lib/fast/babyShelf.ts.

import { normalizeShareCount } from './normalizeShares';
import { computeBabyShelf } from './fast/babyShelf';

export interface BabyShelfCapacity {
  publicFloatValue: number;
  /** null when public float is >= $75M — I.B.6 doesn't apply, not "unlimited". */
  annualCapacity: number | null;
  capacityQuarters: number | undefined;
  babyShelfEligible: boolean;
}

/**
 * Compute Form S-3 I.B.6 baby-shelf primary-offering capacity for Short
 * Check's ExtractedData shape. Returns undefined when float or price is
 * missing/invalid — callers should fall back to badge-based heuristics,
 * same as every other factor in shortCheckScoring.ts degrades when OCR
 * data is incomplete.
 */
export function computeBabyShelfCapacity(
  float: number | undefined,
  price: number | undefined,
  quarterlyBurnRate: number | undefined
): BabyShelfCapacity | undefined {
  const floatShares = normalizeShareCount(float);
  if (!floatShares || !price || price <= 0) return undefined;

  let quarterlyBurn: number | null = null;
  if (quarterlyBurnRate !== undefined && quarterlyBurnRate < 0) {
    // Same "<1000 means the value is expressed in millions" convention used
    // for burn/cash throughout shortCheckScoring.ts. computeBabyShelf wants
    // an absolute positive dollar figure.
    let burn = Math.abs(quarterlyBurnRate);
    if (burn < 1000) burn = burn * 1_000_000;
    quarterlyBurn = burn;
  }

  const result = computeBabyShelf({ floatShares, price, quarterlyBurn });

  return {
    publicFloatValue: result.publicFloatValue as number, // non-null: floatShares/price already validated above
    annualCapacity: result.babyShelfCapacity,
    capacityQuarters: result.capacityQuarters ?? undefined,
    babyShelfEligible: result.babyShelfCapacity !== null,
  };
}

/** Human-readable summary, e.g. "$2.01M annual shelf capacity ~ 12 days of burn". */
export function formatBabyShelfCapacity(capacity: BabyShelfCapacity): string {
  const fmtDollars = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${(v / 1_000).toFixed(0)}K`;

  if (!capacity.babyShelfEligible || capacity.annualCapacity === null) {
    return `${fmtDollars(capacity.publicFloatValue)} public float (>= $75M, I.B.6 cap does not apply)`;
  }

  let out = `${fmtDollars(capacity.annualCapacity)} annual shelf capacity`;
  if (capacity.capacityQuarters !== undefined) {
    if (capacity.capacityQuarters < 1) {
      const days = Math.round(capacity.capacityQuarters * 91.25);
      out += ` ~ ${days} days of burn`;
    } else {
      out += ` ~ ${capacity.capacityQuarters.toFixed(1)} quarters of burn`;
    }
  }
  return out;
}
