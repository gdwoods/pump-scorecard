import type { NexusFilingRef } from './fetchOperatingNexus';

/** Cache identity: refreshes when annual or proxy filing dates/forms change. */
export function buildNexusFilingKey(cik: string, filings: NexusFilingRef[]): string {
  const bare = String(cik).replace(/^0+/, '') || '0';
  if (filings.length === 0) return `${bare}|none`;
  const parts = [...filings]
    .sort((a, b) => a.form.localeCompare(b.form) || a.filingDate.localeCompare(b.filingDate))
    .map((f) => `${f.form}@${f.filingDate}`);
  return `${bare}|${parts.join('|')}`;
}