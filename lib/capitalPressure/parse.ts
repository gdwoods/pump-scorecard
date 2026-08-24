/**
 * Conservative Capital Pressure filing parser.
 * Phrase-gated; scoreable facts require nearby numeric/date context.
 * Capacity (shelf/ATM/equity line/registration) is never treated as issuance.
 */

import type {
  CapitalEvent,
  CapitalEventType,
  CapitalPressureFundamentals,
  FilingDocumentInput,
  ParsedCapitalPressure,
  SecEvidence,
  XbrlSnapshot,
} from './types';

const MAX_EXCERPT = 280;

const PHRASE_PATTERNS: Array<{
  type: CapitalEventType | 'going_concern';
  re: RegExp;
  capacityDefault: boolean;
}> = [
  { type: 'atm_program', re: /\bat[\s-]+the[\s-]+market\b|\batm\s+offering\b|\batm\s+program\b/i, capacityDefault: true },
  { type: 'equity_line', re: /\bequity\s+line\b|\bELOC\b|\bYorkville\b|\bpurchase\s+agreement\b/i, capacityDefault: true },
  { type: 'registered_direct', re: /\bregistered\s+direct\b/i, capacityDefault: false },
  { type: 'convertible_note', re: /\bconvertible\b|\bconversion\s+price\b|\blowest\s+daily\s+VWAP\b/i, capacityDefault: true },
  { type: 'note_conversion', re: /\bconversion\s+of\s+(?:the\s+)?(?:notes?|debentures?)\b|\bconverted\s+into\s+.*common\s+stock\b/i, capacityDefault: false },
  { type: 'debt_for_equity', re: /\bdebt.{0,40}common\s+stock\b|\bexchanged?\s+.{0,40}(?:debt|notes?).{0,40}(?:shares|common\s+stock)\b/i, capacityDefault: false },
  { type: 'warrant_exercise', re: /\bwarrant\s+exercis/i, capacityDefault: false },
  { type: 'prospectus_supplement', re: /\bprospectus\s+supplement\b/i, capacityDefault: true },
  { type: 'shelf_registration', re: /\bshelf\s+registration\b|\bregistration\s+statement\b|\bon\s+Form\s+S-3\b|\bon\s+Form\s+F-3\b/i, capacityDefault: true },
  { type: 'reverse_split', re: /\breverse\s+stock\s+split\b|\breverse\s+split\b/i, capacityDefault: false },
  { type: 'nasdaq_deficiency', re: /\bminimum\s+bid\s+price\b|\bstockholders['']\s+equity\b.{0,40}deficiency|\bNasdaq\s+deficiency\b|\breceived\s+a\s+notification\s+letter\s+from\s+Nasdaq\b/i, capacityDefault: false },
  { type: 'nasdaq_compliance', re: /\bregained\s+compliance\b|\bhas\s+regained\s+compliance\b|\bnow\s+in\s+compliance\s+with\s+.*(?:bid\s+price|stockholders['']\s+equity)\b/i, capacityDefault: false },
  { type: 'going_concern', re: /\bgoing\s+concern\b|\bsubstantial\s+doubt\b/i, capacityDefault: false },
];

const ISSUANCE_VERBS =
  /\b(?:issued|sold|sells|selling|closed\s+the\s+sale|completed\s+the\s+sale|purchased\s+from\s+the\s+company|shares\s+were\s+issued)\b/i;

const VARIABLE_VWAP =
  /\b(?:lowest\s+daily\s+VWAP|variable\s+conversion|discount(?:ed)?\s+(?:to\s+)?(?:the\s+)?(?:VWAP|market)|%\s*of\s+(?:the\s+)?(?:lowest|average)\s+(?:daily\s+)?VWAP)\b/i;

/** True when the match is under a clear negation (did not / no / without / not). */
function isNegated(text: string, matchIndex: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 80), matchIndex).toLowerCase();
  // "no going concern", "did not enter into any at the market", "not in compliance"
  if (/\b(?:no|not|without|neither|nor)\s+$/i.test(before)) return true;
  if (/\b(?:did\s+not|does\s+not|do\s+not|will\s+not|never)\b[\s\w,]{0,60}$/i.test(before)) return true;
  if (/\bnot\s+in\s+$/i.test(before)) return true;
  return false;
}

export function stripHtml(input: string): string {
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipExcerpt(text: string, index: number, matchLen: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + matchLen + 160);
  let excerpt = text.slice(start, end).trim();
  if (start > 0) excerpt = '…' + excerpt;
  if (end < text.length) excerpt = excerpt + '…';
  if (excerpt.length > MAX_EXCERPT) {
    excerpt = excerpt.slice(0, MAX_EXCERPT - 1) + '…';
  }
  return excerpt;
}

function parseNumberNear(window: string): number | undefined {
  // $1.5 million / $2,000,000 / 1,250,000 shares
  const money = window.match(
    /\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion|m|b)?/i
  );
  if (money) {
    let n = parseFloat(money[1].replace(/,/g, ''));
    const unit = (money[2] || '').toLowerCase();
    if (unit === 'million' || unit === 'm') n *= 1_000_000;
    if (unit === 'billion' || unit === 'b') n *= 1_000_000_000;
    if (!Number.isNaN(n)) return n;
  }
  const shares = window.match(
    /([\d,]+(?:\.\d+)?)\s*(million|m)?\s*(?:shares|share)/i
  );
  if (shares) {
    let n = parseFloat(shares[1].replace(/,/g, ''));
    const unit = (shares[2] || '').toLowerCase();
    if (unit === 'million' || unit === 'm') n *= 1_000_000;
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function hasDateNear(window: string): boolean {
  return (
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i.test(
      window
    ) || /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(window) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(window)
  );
}

function hasNumericOrDateContext(window: string): boolean {
  return parseNumberNear(window) !== undefined || hasDateNear(window) || /\$\s*[\d,]/.test(window);
}

function makeEvidence(
  doc: FilingDocumentInput,
  excerpt: string,
  confidence: 'high' | 'needs_review'
): SecEvidence {
  return {
    form: doc.form,
    accessionNumber: doc.accessionNumber,
    filingDate: doc.filingDate,
    documentUrl: doc.documentUrl,
    excerpt,
    confidence,
  };
}

function titleFor(type: CapitalEventType, capacityOnly: boolean): string {
  const map: Record<CapitalEventType, string> = {
    shelf_registration: 'Shelf registration',
    atm_program: 'ATM program',
    equity_line: 'Equity line',
    registered_direct: 'Registered direct',
    convertible_note: 'Convertible note',
    note_conversion: 'Note conversion',
    debt_for_equity: 'Debt-for-equity settlement',
    warrant_exercise: 'Warrant exercise',
    prospectus_supplement: 'Prospectus supplement',
    reverse_split: 'Reverse stock split',
    nasdaq_deficiency: 'Nasdaq deficiency notice',
    nasdaq_compliance: 'Nasdaq compliance regained',
  };
  const base = map[type];
  return capacityOnly ? `${base} (capacity)` : base;
}

function classifyIssuance(
  type: CapitalEventType,
  capacityDefault: boolean,
  window: string,
  form: string
): { capacityOnly: boolean; isIssuance: boolean } {
  // Registration / shelf / ATM program setup = capacity unless issuance verbs + shares
  if (
    type === 'shelf_registration' ||
    type === 'atm_program' ||
    type === 'equity_line' ||
    type === 'prospectus_supplement'
  ) {
    const issued = ISSUANCE_VERBS.test(window) && parseNumberNear(window) !== undefined;
    // Prospectus supplements on 424B often disclose sales — still require issuance language
    if (form.startsWith('424B') && ISSUANCE_VERBS.test(window)) {
      return { capacityOnly: !issued, isIssuance: issued };
    }
    return { capacityOnly: !issued, isIssuance: issued };
  }

  if (type === 'registered_direct' || type === 'note_conversion' || type === 'debt_for_equity' || type === 'warrant_exercise') {
    const issued = ISSUANCE_VERBS.test(window) || /\bissued\b|\bsold\b|\bconverted\b/i.test(window);
    return { capacityOnly: !issued && capacityDefault, isIssuance: issued };
  }

  if (type === 'convertible_note') {
    // Facility description = capacity; conversion of notes = issuance via note_conversion
    return { capacityOnly: true, isIssuance: false };
  }

  // reverse_split, nasdaq_* — not financing issuance
  return { capacityOnly: false, isIssuance: false };
}

export type ParseDocResult = {
  events: CapitalEvent[];
  goingConcern?: { present: boolean; evidence: SecEvidence };
  flags: {
    variableVwapConvertible?: boolean;
    fixedPriceConvertible?: boolean;
  };
};

export function parseFilingDocument(doc: FilingDocumentInput): ParseDocResult {
  const text = /<[^>]+>/.test(doc.text) ? stripHtml(doc.text) : doc.text;
  const events: CapitalEvent[] = [];
  const flags: ParseDocResult['flags'] = {};
  let goingConcern: ParseDocResult['goingConcern'];
  let eventIdx = 0;

  for (const phrase of PHRASE_PATTERNS) {
    const re = new RegExp(phrase.re.source, phrase.re.flags.includes('g') ? phrase.re.flags : phrase.re.flags + 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const idx = match.index;
      if (isNegated(text, idx)) continue;

      const window = text.slice(Math.max(0, idx - 120), Math.min(text.length, idx + match[0].length + 200));
      const excerpt = clipExcerpt(text, idx, match[0].length);
      const hasContext = hasNumericOrDateContext(window);
      const confidence: 'high' | 'needs_review' = hasContext ? 'high' : 'needs_review';

      if (phrase.type === 'going_concern') {
        // Only score from 10-Q / 10-K later; still capture evidence here
        if (!goingConcern) {
          goingConcern = {
            present: true,
            evidence: makeEvidence(doc, excerpt, confidence),
          };
        }
        continue;
      }

      const type = phrase.type as CapitalEventType;
      const { capacityOnly, isIssuance } = classifyIssuance(
        type,
        phrase.capacityDefault,
        window,
        doc.form
      );

      if (type === 'convertible_note') {
        if (VARIABLE_VWAP.test(window)) flags.variableVwapConvertible = true;
        else if (/\bfixed\s+(?:conversion\s+)?price\b|\bconversion\s+price\s+of\s+\$/i.test(window)) {
          flags.fixedPriceConvertible = true;
        }
      }

      // Form-based overrides for shelf / prospectus
      let finalType = type;
      if (
        (doc.form.startsWith('S-3') || doc.form.startsWith('F-3')) &&
        (type === 'shelf_registration' || type === 'prospectus_supplement')
      ) {
        finalType = 'shelf_registration';
      }
      if (doc.form.startsWith('424B') && type === 'shelf_registration') {
        finalType = 'prospectus_supplement';
      }

      const amount = parseNumberNear(window);
      const sharesMatch = window.match(
        /([\d,]+(?:\.\d+)?)\s*(million|m)?\s*(?:shares|share)/i
      );
      let shares: number | undefined;
      if (sharesMatch) {
        shares = parseFloat(sharesMatch[1].replace(/,/g, ''));
        if ((sharesMatch[2] || '').toLowerCase().startsWith('m')) shares *= 1_000_000;
      }

      const moneyMatch = window.match(
        /\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion|m|b)?/i
      );
      let proceeds: number | undefined;
      if (moneyMatch && /\$/.test(window)) {
        proceeds = parseFloat(moneyMatch[1].replace(/,/g, ''));
        const unit = (moneyMatch[2] || '').toLowerCase();
        if (unit === 'million' || unit === 'm') proceeds *= 1_000_000;
        if (unit === 'billion' || unit === 'b') proceeds *= 1_000_000_000;
      }

      const verifiedAt = new Date().toISOString();
      const event: CapitalEvent = {
        id: `${doc.accessionNumber || doc.filingDate}-${finalType}-${eventIdx++}`,
        eventDate: doc.filingDate,
        type: finalType,
        title: titleFor(finalType, capacityOnly && !isIssuance),
        description: excerpt.slice(0, 200),
        isCapacityOnly: capacityOnly && !isIssuance,
        filedAt: doc.filingDate,
        verifiedAt,
        evidence: makeEvidence(doc, excerpt, confidence),
      };

      if (isIssuance && shares !== undefined) event.sharesIssued = shares;
      if (isIssuance && proceeds !== undefined) event.grossProceedsUsd = proceeds;
      if (!isIssuance && capacityOnly) {
        if (shares !== undefined) event.potentialShares = shares;
        if (proceeds !== undefined) event.grossProceedsUsd = proceeds;
      }
      // For equity-line draws etc., amount without clear share count still OK as proceeds
      if (isIssuance && event.sharesIssued === undefined && amount !== undefined && shares === undefined) {
        // Prefer not to invent shares from dollar amounts
      }

      // De-dupe identical type+date+form within same doc for same phrase type
      const dup = events.some(
        (e) =>
          e.type === event.type &&
          e.eventDate === event.eventDate &&
          e.evidence.accessionNumber === event.evidence.accessionNumber
      );
      if (!dup) events.push(event);

      // One match per phrase type per document is enough for scoring
      break;
    }
  }

  return { events, goingConcern, flags };
}

export function parseCapitalPressureDocuments(
  docs: FilingDocumentInput[],
  opts: {
    windowStart: string;
    windowEnd: string;
    xbrl?: XbrlSnapshot;
    partial?: boolean;
    parseNotes?: string[];
    asOf?: string;
  }
): ParsedCapitalPressure {
  const allEvents: CapitalEvent[] = [];
  const fundamentals: CapitalPressureFundamentals = {};
  const scannedThrough = opts.asOf || new Date().toISOString();

  // Prefer latest 10-Q/10-K for going concern
  const periodics = docs
    .filter((d) => d.form.startsWith('10-Q') || d.form.startsWith('10-K'))
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate));

  let gcFromPeriodic: CapitalPressureFundamentals['goingConcern'];

  for (const doc of docs) {
    const parsed = parseFilingDocument(doc);
    allEvents.push(...parsed.events);

    if (
      (doc.form.startsWith('10-Q') || doc.form.startsWith('10-K')) &&
      parsed.goingConcern &&
      !gcFromPeriodic
    ) {
      // Only accept GC from the latest periodic
      if (periodics[0] && doc.accessionNumber === periodics[0].accessionNumber) {
        gcFromPeriodic = {
          present: parsed.goingConcern.present,
          evidence: parsed.goingConcern.evidence,
        };
      } else if (!periodics[0]) {
        gcFromPeriodic = {
          present: parsed.goingConcern.present,
          evidence: parsed.goingConcern.evidence,
        };
      }
    }

    // Attach convertible flags as synthetic evidence events already present
    if (parsed.flags.variableVwapConvertible) {
      // Ensure convertible event exists with high confidence if VWAP found
      const existing = allEvents.find(
        (e) =>
          e.type === 'convertible_note' &&
          e.evidence.accessionNumber === doc.accessionNumber
      );
      if (existing) {
        existing.description =
          'Convertible note with variable or discounted VWAP conversion terms. ' +
          existing.description;
      }
    }
  }

  // If latest periodic was parsed and has GC phrase
  if (periodics[0]) {
    const latestParsed = parseFilingDocument(periodics[0]);
    if (latestParsed.goingConcern) {
      gcFromPeriodic = {
        present: true,
        evidence: latestParsed.goingConcern.evidence,
      };
    } else {
      gcFromPeriodic = { present: false };
    }
  }

  fundamentals.goingConcern = gcFromPeriodic;

  if (opts.xbrl) {
    if (opts.xbrl.cashUsd !== undefined) {
      fundamentals.cashUsd = opts.xbrl.cashUsd;
      fundamentals.cashAsOf = opts.xbrl.cashAsOf;
    }
    if (opts.xbrl.operatingCashFlowUsd !== undefined) {
      fundamentals.operatingCashFlowUsd = opts.xbrl.operatingCashFlowUsd;
      fundamentals.ocfAsOf = opts.xbrl.ocfAsOf;
    }
    if (opts.xbrl.currentAssetsUsd !== undefined) {
      fundamentals.currentAssetsUsd = opts.xbrl.currentAssetsUsd;
    }
    if (opts.xbrl.currentLiabilitiesUsd !== undefined) {
      fundamentals.currentLiabilitiesUsd = opts.xbrl.currentLiabilitiesUsd;
    }
    if (opts.xbrl.totalAssetsUsd !== undefined) {
      fundamentals.totalAssetsUsd = opts.xbrl.totalAssetsUsd;
      fundamentals.balanceSheetAsOf = opts.xbrl.balanceSheetAsOf;
    }
    if (opts.xbrl.sharesOutstanding !== undefined) {
      fundamentals.sharesOutstanding = opts.xbrl.sharesOutstanding;
      fundamentals.sharesOutstandingAsOf = opts.xbrl.sharesOutstandingAsOf;
    }
  }

  allEvents.sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  return {
    events: allEvents,
    fundamentals,
    windowStart: opts.windowStart,
    windowEnd: opts.windowEnd,
    scannedThrough,
    partial: opts.partial,
    parseNotes: opts.parseNotes,
  };
}

/** Detect variable/discounted VWAP conversion from events + descriptions. */
export function hasVariableVwapConvertible(events: CapitalEvent[]): boolean {
  return events.some(
    (e) =>
      e.type === 'convertible_note' &&
      VARIABLE_VWAP.test(e.description + ' ' + e.evidence.excerpt)
  );
}

export function hasFixedPriceConvertible(events: CapitalEvent[]): boolean {
  return events.some(
    (e) =>
      e.type === 'convertible_note' &&
      !VARIABLE_VWAP.test(e.description + ' ' + e.evidence.excerpt) &&
      /\bfixed\b|\bconversion\s+price\s+of\s+\$/i.test(
        e.description + ' ' + e.evidence.excerpt
      )
  );
}
