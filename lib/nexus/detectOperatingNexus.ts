import { GROUP_RANK, NEXUS_LOCALES, type NexusLocale } from './locales';

export type NexusDocumentInput = {
  form: string;
  filingDate: string;
  documentUrl: string;
  text: string;
};

export type OperatingNexusEvidence = {
  form: string;
  filingDate: string;
  documentUrl: string;
  excerpt: string;
  places: string[];
};

export type OperatingNexus = {
  places: string[];
  headline: string;
  evidence: OperatingNexusEvidence[];
};

const OFFICE =
  /\b(offices?|facilit(?:y|ies)|headquarters|headquartered|product development|research and development|r\s*&\s*d)\b/gi;
const EMPLOYEES = /\bemployees?\b/gi;
const CONTROL =
  /\b(incorporated (?:in|under)|organized under|voting agreement|beneficial(?:ly)?\s+owners?|beneficially owned|wholly[- ]owned)\b/gi;
const HYPHEN_INCORPORATED = /-incorporated\b/gi;
const MEETING = /\b(annual meeting|special meeting|will be held)\b/i;
const ADDRESS = /\b(rd\.|road|street|blvd|avenue|ave\.|floor|city|county|no\.)\b/gi;
const SUBSIDIARY = /\b(subsidiar(?:y|ies)|affiliates?|branches)\b/gi;
const OWNERSHIP = /\b(beneficial(?:ly)?\s+owners?|voting agreement|\d+(?:\.\d+)?\s*%)/i;
const BOILERPLATE =
  /\b(compulsory licen[sc]|intellectual property|export controls?|ofac|tariffs?|economic sanctions|many foreign countries)\b/i;
const MACHINE_TEXT = /us-gaap|iso4217|xmlns|contextref/i;

const GEO_NEXT = new Set([
  'island',
  'islands',
  'city',
  'province',
  'county',
  'sar',
  'republic',
  'standard',
]);

type Occurrence = {
  locale: NexusLocale;
  index: number;
  match: string;
};

type Hit = {
  form: string;
  filingDate: string;
  documentUrl: string;
  excerpt: string;
  places: string[];
  score: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const LOCALE_BY_KEY = new Map<string, NexusLocale>();
for (const locale of NEXUS_LOCALES) {
  for (const alias of locale.aliases) {
    LOCALE_BY_KEY.set(normalizeKey(alias), locale);
  }
}

const LOCALE_SOURCE = NEXUS_LOCALES.flatMap((locale) => {
  if (locale.pattern) return [locale.pattern];
  return [...locale.aliases]
    .sort((a, b) => b.length - a.length)
    .map((alias) => escapeRegExp(alias).replace(/\\ /g, '\\s+'));
})
  .sort((a, b) => b.length - a.length)
  .map((source) => `(?:${source})`)
  .join('|');

const LOCALE_PATTERN = `(?<![A-Za-z0-9])(?:${LOCALE_SOURCE})(?![A-Za-z0-9])`;

function htmlToPlainText(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;|&#8217;|&apos;/gi, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      return value > 0 && value < 65536 ? String.fromCharCode(value) : ' ';
    })
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text: string): string[] {
  const protectedText = text.replace(
    /\b(?:R\.O\.C|U\.S\.A|U\.S|a\.m|p\.m|e\.g|i\.e|St|Rd|No|Inc|Ltd|Mr|Mrs|Ms|Dr|Jr|Sr|Ave|Blvd|vs|etc|Fig|Dept|Co)\./gi,
    (token) => token.replace(/\./g, '\u0000')
  );
  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\u0000/g, '.').trim())
    .filter((sentence) => sentence.length >= 20);
}

function windows(text: string, size: number, step: number): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    out.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
  }
  return out;
}

function findOccurrences(text: string): Occurrence[] {
  const re = new RegExp(LOCALE_PATTERN, 'gi');
  const out: Occurrence[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const locale = LOCALE_BY_KEY.get(normalizeKey(match[0]));
    if (!locale) continue;
    out.push({ locale, index: match.index, match: match[0] });
    if (match.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

function isCorporateNamePrefix(text: string, index: number, length: number): boolean {
  const after = text.slice(index + length);
  const next = /^\s+([A-Z][A-Za-z]+)/.exec(after);
  if (!next) return false;
  return !GEO_NEXT.has(next[1].toLowerCase());
}

function near(text: string, start: number, end: number, pattern: RegExp, maxDist: number): boolean {
  const re = new RegExp(pattern.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const anchorStart = match.index;
    const anchorEnd = match.index + match[0].length;
    const dist = start >= anchorEnd ? start - anchorEnd : anchorStart >= end ? anchorStart - end : 0;
    if (dist <= maxDist) return true;
    if (match.index === re.lastIndex) re.lastIndex += 1;
  }
  return false;
}

function isNamedEntity(text: string, occurrence: Occurrence): boolean {
  const before = text.slice(Math.max(0, occurrence.index - 8), occurrence.index);
  const after = text.slice(
    occurrence.index + occurrence.match.length,
    occurrence.index + occurrence.match.length + 28
  );
  return (
    /\b(?:a|an)\s+$/i.test(before) &&
    /^\s+(company|corporation|entity|affiliate|limited)\b/i.test(after)
  );
}

function qualifies(text: string, occurrence: Occurrence): boolean {
  const start = occurrence.index;
  const end = occurrence.index + occurrence.match.length;
  if (near(text, start, end, OFFICE, 80)) return true;
  if (near(text, start, end, EMPLOYEES, 50)) return true;
  if (near(text, start, end, CONTROL, 80)) return true;
  if (near(text, start, end, HYPHEN_INCORPORATED, 20)) return true;
  if (near(text, start, end, SUBSIDIARY, 32)) return true;
  if (isNamedEntity(text, occurrence)) return true;
  return MEETING.test(text) && near(text, start, end, ADDRESS, 90);
}

function scoreChunk(text: string, occurrence: Occurrence): number {
  const start = occurrence.index;
  const end = occurrence.index + occurrence.match.length;
  if (near(text, start, end, OFFICE, 80) || near(text, start, end, EMPLOYEES, 50)) return 5;
  if (MEETING.test(text) && near(text, start, end, ADDRESS, 90)) return 5;
  if (isNamedEntity(text, occurrence) || near(text, start, end, CONTROL, 80)) return 4;
  return 2;
}

function excerptAround(text: string, index: number): string {
  let start = Math.max(0, index - 110);
  let end = Math.min(text.length, index + 170);
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space !== -1 && space < index) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > index) end = space;
  }
  let slice = text.slice(start, end).replace(/\s+/g, ' ').trim();
  slice = slice.replace(/[—–]/g, '-');
  if (start > 0) slice = `...${slice}`;
  if (end < text.length) slice = `${slice}...`;
  return slice;
}

function evaluateChunk(chunk: string): { places: string[]; score: number; excerpt: string } | null {
  if (MACHINE_TEXT.test(chunk) || chunk.length < 20) return null;
  const occurrences = findOccurrences(chunk).filter((occurrence) => {
    if (!isCorporateNamePrefix(chunk, occurrence.index, occurrence.match.length)) return true;
    const start = occurrence.index;
    const end = start + occurrence.match.length;
    if (near(chunk, start, end, OWNERSHIP, 220)) return true;
    if (near(chunk, start, end, ADDRESS, 90)) return true;
    return false;
  });
  const qualifying = occurrences.filter((occurrence) => qualifies(chunk, occurrence));
  if (qualifying.length === 0) return null;
  if (
    BOILERPLATE.test(chunk) &&
    !qualifying.some((occurrence) => {
      const start = occurrence.index;
      const end = start + occurrence.match.length;
      return (
        near(chunk, start, end, OFFICE, 80) ||
        near(chunk, start, end, EMPLOYEES, 50) ||
        isNamedEntity(chunk, occurrence) ||
        (MEETING.test(chunk) && near(chunk, start, end, ADDRESS, 90))
      );
    })
  ) {
    return null;
  }

  const labels: string[] = [];
  let best = qualifying[0];
  let bestScore = scoreChunk(chunk, best);
  for (const occurrence of qualifying) {
    if (!labels.includes(occurrence.locale.label)) labels.push(occurrence.locale.label);
    const score = scoreChunk(chunk, occurrence);
    if (score > bestScore) {
      best = occurrence;
      bestScore = score;
    }
  }

  return {
    places: labels,
    score: bestScore,
    excerpt: excerptAround(chunk, best.index),
  };
}

const PLACE_ARTICLE = new Set([
  'Cayman Islands',
  'British Virgin Islands',
  'Marshall Islands',
  'Bahamas',
  'Philippines',
  'United Arab Emirates',
  'Cook Islands',
  'Isle of Man',
  'Seychelles',
]);

function withArticle(place: string): string {
  return PLACE_ARTICLE.has(place) ? `the ${place}` : place;
}

function formatPlaceList(places: string[]): string {
  const labeled = places.map(withArticle);
  if (labeled.length === 1) return labeled[0];
  if (labeled.length === 2) return `${labeled[0]} and ${labeled[1]}`;
  return `${labeled.slice(0, -1).join(', ')}, and ${labeled[labeled.length - 1]}`;
}

function buildHeadline(places: string[]): string {
  if (places.length <= 4) {
    return `Listed in the US. Filings tie operations or control to ${formatPlaceList(places)}.`;
  }
  return `Listed in the US. Filings tie operations or control to ${formatPlaceList(places.slice(0, 3))}, and other jurisdictions.`;
}

function pickEvidence(hits: Hit[]): Hit[] {
  const unique: Hit[] = [];
  const seen = new Set<string>();
  const sorted = [...hits].sort((a, b) => b.score - a.score || a.excerpt.length - b.excerpt.length);
  for (const hit of sorted) {
    const key = hit.excerpt.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
  }

  const picked = unique.slice(0, 3);
  if (picked.length === 0) return picked;
  const forms = new Set(picked.map((hit) => hit.form));
  if (forms.size === 1) {
    const other = unique.find((hit) => hit.form !== picked[0].form);
    if (other) {
      if (picked.length < 3) picked.push(other);
      else picked[picked.length - 1] = other;
    }
  }
  return picked;
}

export function detectOperatingNexus(docs: NexusDocumentInput[]): OperatingNexus | null {
  const hits: Hit[] = [];

  for (const doc of docs) {
    if (!doc?.text) continue;
    const plain = htmlToPlainText(doc.text);
    const sentences = splitSentences(plain);
    for (const sentence of sentences) {
      const chunks = sentence.length > 460 ? windows(sentence, 460, 300) : [sentence];
      for (const chunk of chunks) {
        const evaluated = evaluateChunk(chunk);
        if (!evaluated) continue;
        hits.push({
          form: doc.form,
          filingDate: doc.filingDate,
          documentUrl: doc.documentUrl,
          excerpt: evaluated.excerpt,
          places: evaluated.places,
          score: evaluated.score,
        });
      }
    }
  }

  if (hits.length === 0) return null;

  const counts = new Map<string, { count: number; group: number }>();
  for (const hit of hits) {
    for (const label of hit.places) {
      const locale = NEXUS_LOCALES.find((item) => item.label === label);
      const group = locale ? GROUP_RANK[locale.group] : 9;
      const current = counts.get(label);
      counts.set(label, { count: (current?.count ?? 0) + 1, group });
    }
  }

  const places = [...counts.entries()]
    .sort((a, b) => a[1].group - b[1].group || b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([label]) => label);

  return {
    places,
    headline: buildHeadline(places),
    evidence: pickEvidence(hits).map((hit) => ({
      form: hit.form,
      filingDate: hit.filingDate,
      documentUrl: hit.documentUrl,
      excerpt: hit.excerpt,
      places: hit.places,
    })),
  };
}
