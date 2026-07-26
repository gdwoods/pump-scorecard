// lib/normalizeShares.ts
// Centralize share-count units: values under 1000 are treated as millions.

export function normalizeShareCount(
  value: number | undefined | null
): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return undefined;
  }
  return value < 1000 ? value * 1_000_000 : value;
}
