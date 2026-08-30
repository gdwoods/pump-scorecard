// lib/forensic/sanitizePdfText.ts
//
// pdf-lib StandardFonts use WinAnsi encoding — strip/replace Unicode that
// cannot be encoded (e.g. U+2011 non-breaking hyphen from LLM output).

const REPLACEMENTS: Array<[string, string]> = [
  ['\u2011', '-'], // non-breaking hyphen
  ['\u2010', '-'], // hyphen
  ['\u2012', '-'], // figure dash
  ['\u2013', '-'], // en dash
  ['\u2014', '-'], // em dash
  ['\u2212', '-'], // minus sign
  ['\u00ad', '-'], // soft hyphen
  ['\u2018', "'"], // left single quote
  ['\u2019', "'"], // right single quote
  ['\u201a', "'"],
  ['\u201b', "'"],
  ['\u201c', '"'], // left double quote
  ['\u201d', '"'], // right double quote
  ['\u201e', '"'],
  ['\u201f', '"'],
  ['\u2026', '...'], // ellipsis
  ['\u00a0', ' '], // nbsp
  ['\u200b', ''], // zero-width space
  ['\u200c', ''],
  ['\u200d', ''],
  ['\u2060', ''],
  ['\u2500', '-'], // box drawing horizontal
  ['\u2501', '-'],
  ['\u2013', '-'],
];

/** Normalize text for pdf-lib WinAnsi fonts. Unmapped chars become '?'. */
export function sanitizePdfText(text: string): string {
  let out = text;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to);
  }

  // Drop remaining non-Latin-1 / non-WinAnsi-safe code points.
  return Array.from(out, (ch) => {
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13) return ch;
    if (code >= 32 && code <= 126) return ch;
    if (code >= 160 && code <= 255) return ch;
    return '?';
  }).join('');
}
