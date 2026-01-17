/**
 * Utility functions for checking alert flags and values
 */

export function hasValidUnderwriter(underwriter: string | null | undefined): boolean {
  if (!underwriter) return false;
  const value = String(underwriter).trim().toLowerCase();
  return value !== "" && value !== "nan" && value !== "none" && value !== "null";
}
