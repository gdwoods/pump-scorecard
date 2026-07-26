// lib/wireNews/extractTickers.ts
const EXCHANGE_PREFIX =
  /\b(?:NASDAQ|NYSE|NYSEAMERICAN|AMEX|OTCQB|OTCQX|OTC|TSX|TSXV|CSE)\s*[:\s]\s*([A-Z][A-Z0-9.]{0,9})\b/gi;

const PAREN_TICKER = /\(([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\)/g;

const BLOCKLIST = new Set([
  'CEO', 'CFO', 'CTO', 'COO', 'USA', 'USD', 'UTC', 'ETF', 'LLC', 'INC', 'LTD',
  'THE', 'AND', 'FOR', 'NEW', 'PDF', 'HTML', 'HTTP', 'HTTPS', 'RSS', 'FDA',
  'SEC', 'IPO', 'ATM', 'AI', 'PR', 'Q1', 'Q2', 'Q3', 'Q4', 'FY',
]);

function normalizeTicker(raw: string): string | null {
  const t = raw.toUpperCase().replace(/[^A-Z0-9.]/g, '');
  if (!t || t.length > 10) return null;
  if (BLOCKLIST.has(t)) return null;
  // Prefer 2–5 char US-style tickers; allow dotted Canadian (e.g. ABC.V → skip for now)
  if (!/^[A-Z]{1,5}$/.test(t)) return null;
  return t;
}

/** Extract tickers from wire RSS category tags like `Nasdaq:EDHL`. */
export function extractTickersFromCategories(categories: string[]): string[] {
  const out = new Set<string>();
  for (const cat of categories) {
    const m = cat.match(EXCHANGE_PREFIX);
    if (m) {
      EXCHANGE_PREFIX.lastIndex = 0;
      let match: RegExpExecArray | null;
      const re = new RegExp(EXCHANGE_PREFIX.source, 'gi');
      while ((match = re.exec(cat)) !== null) {
        const t = normalizeTicker(match[1]);
        if (t) out.add(t);
      }
    }
    // Bare "Nasdaq:EDHL" already handled; also "EDHL" after colon-only forms
    const simple = cat.match(/^[A-Za-z]+:\s*([A-Z][A-Z0-9.]{0,9})$/i);
    if (simple) {
      const t = normalizeTicker(simple[1]);
      if (t) out.add(t);
    }
  }
  return [...out];
}

/** Extract tickers from title/description text. */
export function extractTickersFromText(text: string): string[] {
  const out = new Set<string>();
  const exchangeRe = new RegExp(EXCHANGE_PREFIX.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = exchangeRe.exec(text)) !== null) {
    const t = normalizeTicker(match[1]);
    if (t) out.add(t);
  }

  // Only use parenthetical tickers when exchange-prefixed ones weren't found
  // nearby — reduces false positives from (FDA), (CEO), etc. Already blocklisted.
  const parenRe = new RegExp(PAREN_TICKER.source, 'g');
  while ((match = parenRe.exec(text)) !== null) {
    const t = normalizeTicker(match[1]);
    if (t) out.add(t);
  }

  return [...out];
}
