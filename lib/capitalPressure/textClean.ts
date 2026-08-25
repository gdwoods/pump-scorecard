/**
 * Clean SEC excerpt / description text for display and scoring excerpts.
 * Decodes common HTML entities and collapses noisy whitespace / table junk.
 */

const NAMED: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201C',
  rdquo: '\u201D',
};

export function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = parseInt(hex, 16);
      if (!Number.isFinite(code)) return '';
      // Treat NBSP as a normal space for readable excerpts
      if (code === 0xa0) return ' ';
      return String.fromCodePoint(code);
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = parseInt(dec, 10);
      if (!Number.isFinite(code)) return '';
      if (code === 160) return ' ';
      return String.fromCodePoint(code);
    })
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => {
      const mapped = NAMED[name.toLowerCase()];
      return mapped !== undefined ? mapped : match;
    });
}

/** Normalize filing text for excerpts shown in the UI / stored on evidence. */
export function cleanFilingText(input: string, maxLen?: number): string {
  let text = decodeHtmlEntities(input);
  text = text
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();

  // Soft-trim leading ellipsis noise from mid-document clips
  text = text.replace(/^[.…\s]+/, '…').replace(/^…\s*/, '…');

  if (maxLen !== undefined && text.length > maxLen) {
    text = text.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
  }
  return text;
}
