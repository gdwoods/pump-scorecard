// utils/formatNumber.ts
export function formatNumber(
  value: number | null | undefined,
  isMoney = false
): string {
  if (value == null || isNaN(value)) return "N/A";

  let num = value;
  let suffix = "";

  if (num >= 1_000_000_000) {
    num = num / 1_000_000_000;
    suffix = "B";
  } else if (num >= 1_000_000) {
    num = num / 1_000_000;
    suffix = "M";
  } else if (num >= 1_000) {
    num = num / 1_000;
    suffix = "K";
  }

  // decide decimals
  const decimals = isMoney ? 2 : suffix ? 2 : 0;

  return (isMoney ? "$" : "") + num.toFixed(decimals) + suffix;
}
