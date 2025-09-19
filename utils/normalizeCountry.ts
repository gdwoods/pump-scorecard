// utils/normalizeCountry.ts
const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR"
]);

export function normalizeCountry(address: any): { state: string; country: string } {
  if (!address) return { state: "", country: "Unknown" };

  const code = address?.stateOrCountry?.toUpperCase() || "";
  const desc = address?.stateOrCountryDescription || "";

  if (US_STATES.has(code)) {
    return { state: code, country: "USA" };
  }

  if (desc && desc.length > 0) {
    return { state: code, country: desc };
  }

  return { state: code, country: code || "Unknown" };
}

export function parseSecAddress(raw: any) {
  if (!raw) return null;

  const { state, country } = normalizeCountry(raw);

  return {
    street1: raw.street1 || "",
    street2: raw.street2 || "",
    city: raw.city || "",
    state,
    zip: raw.zipCode || "",
    country,
  };
}
