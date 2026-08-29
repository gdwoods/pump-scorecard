// lib/fast/babyShelf.ts
import { T } from '@/lib/config/thresholds';
import type { OfferingAbility } from './types';

const BABY_SHELF_FLOAT_VALUE_CAP = 75e6;

/**
 * Form S-3 Instr. I.B.6 — issuers with public float under $75M may sell
 * at most 1/3 of public float in primary offerings over a trailing 12 months.
 */
export function computeBabyShelf(input: {
  floatShares: number | null;
  price: number | null;
  quarterlyBurn: number | null; // absolute dollars of burn (positive number)
  atmDetected?: boolean | null;
  hasEffectiveShelf?: boolean | null;
}): {
  publicFloatValue: number | null;
  babyShelfCapacity: number | null;
  capacityQuarters: number | null;
  derivedOfferingAbility: OfferingAbility;
} {
  const { floatShares, price, quarterlyBurn } = input;

  if (floatShares == null || price == null || floatShares <= 0 || price <= 0) {
    return {
      publicFloatValue: null,
      babyShelfCapacity: null,
      capacityQuarters: null,
      derivedOfferingAbility: 'UNKNOWN',
    };
  }

  const publicFloatValue = floatShares * price;
  const babyShelfCapacity =
    publicFloatValue < BABY_SHELF_FLOAT_VALUE_CAP
      ? publicFloatValue / 3
      : null;

  let capacityQuarters: number | null = null;
  if (babyShelfCapacity != null && quarterlyBurn != null && quarterlyBurn > 0) {
    capacityQuarters = babyShelfCapacity / quarterlyBurn;
  }

  let derivedOfferingAbility: OfferingAbility = 'UNKNOWN';

  if (input.atmDetected && input.hasEffectiveShelf && capacityQuarters != null && capacityQuarters > T.babyShelf.fastHighQuarters) {
    derivedOfferingAbility = 'HIGH';
  } else if (capacityQuarters != null && capacityQuarters < T.babyShelf.fastLowQuarters) {
    derivedOfferingAbility = 'LOW';
  } else if (input.hasEffectiveShelf === false || input.hasEffectiveShelf == null) {
    // No known effective shelf → LOW (DT "Offering Ability: LOW" class)
    // even when raw baby-shelf capacity is fastLowQuarters–criticalQuarters.
    derivedOfferingAbility = 'LOW';
  } else if (capacityQuarters != null) {
    derivedOfferingAbility = 'MEDIUM';
  } else if (babyShelfCapacity != null) {
    derivedOfferingAbility = input.atmDetected ? 'MEDIUM' : 'LOW';
  }

  return {
    publicFloatValue,
    babyShelfCapacity,
    capacityQuarters,
    derivedOfferingAbility,
  };
}
