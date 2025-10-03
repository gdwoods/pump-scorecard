// utils/countryToFlag.ts

export type CountryInfo = {
  flag: string;
  isRisky: boolean;
};

export function countryInfo(country?: string | null): CountryInfo {
  if (!country) return { flag: "", isRisky: false };

  // Normalize name
  const name = country.trim().toUpperCase();

  // ✅ Aliases & cleanup
  const aliases: Record<string, string> = {
    USA: "US",
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",

    UK: "GB",
    ENGLAND: "GB",
    BRITAIN: "GB",
    "UNITED KINGDOM": "GB",

    HONGKONG: "HK",
    "HONG KONG": "HK",

    KOREA: "KR",
    "SOUTH KOREA": "KR",
    "NORTH KOREA": "KP",

    RUSSIA: "RU",
    CAYMAN: "KY",
    "CAYMAN ISLANDS": "KY",
    BERMUDA: "BM",
    "BRITISH VIRGIN ISLANDS": "VG",
    "VIRGIN ISLANDS": "VG",
    BARBADOS: "BB",
    PANAMA: "PA",
    "MARSHALL ISLANDS": "MH",

    CHINA: "CN",
    PRC: "CN",
    TAIWAN: "TW",
    SINGAPORE: "SG",
    MALAYSIA: "MY",
    INDONESIA: "ID",
    THAILAND: "TH",
    INDIA: "IN",

    ISRAEL: "IL",
    CANADA: "CA",
  };

  const code =
    aliases[name] ||
    (name.length === 2 ? name : null);

  if (!code) return { flag: "", isRisky: false };

  // Convert ISO → flag emoji
  const flag = code
    .toUpperCase()
    .replace(/./g, (char) =>
      String.fromCodePoint(127397 + char.charCodeAt(0))
    );

  // ✅ Risky jurisdictions
  const RISKY = new Set([
    "CN", // China
    "HK", // Hong Kong
    "MY", // Malaysia
    "SG", // Singapore
    "KY", // Cayman Islands
    "VG", // British Virgin Islands
    "BM", // Bermuda
    "MH", // Marshall Islands
    "PA", // Panama
    "RU", // Russia
  ]);

  return { flag, isRisky: RISKY.has(code) };
}

// ✅ Named export (so you can keep using { countryToFlag } in Fundamentals.tsx)
export function countryToFlag(country?: string | null): string {
  return countryInfo(country).flag;
}
