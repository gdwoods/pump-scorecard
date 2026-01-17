import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: string | null | undefined): string {
  if (!value || value === "None" || value === "null") return "-";
  try {
    const num = parseFloat(value.replace(/[$,]/g, ""));
    if (num >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(1)}M`;
    }
    if (num >= 1_000) {
      return `$${(num / 1_000).toFixed(1)}K`;
    }
    return value;
  } catch {
    return value;
  }
}
