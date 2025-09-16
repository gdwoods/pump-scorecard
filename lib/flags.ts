// lib/flags.ts
export function countryToFlag(country: string): string {
  const flags: Record<string, string> = {
    "United States": "🇺🇸",
    "China": "🇨🇳",
    "Hong Kong": "🇭🇰",
    "Israel": "🇮🇱",
    "Canada": "🇨🇦",
    "Singapore": "🇸🇬",
    "South Korea": "🇰🇷",
    "United Kingdom": "🇬🇧",
  };

  return flags[country] || "🏳️";
}
