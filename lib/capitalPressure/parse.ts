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
import { cleanFilingText } from './textClean';
import { extractNasdaqCureDate, inferEventCertainty } from './certainty';

const MAX_EXCERPT = 280;

const PHRASE_PATTERNS: Array<{
  type: CapitalEventType | 'going_concern';
  re: RegExp;
  capacityDefault: boolean;
}> = [
  { type: 'atm_program', re: /\bat[\s-]+the[\s-]+market\b|\batm\s+offering\b|\batm\s+program\b/i, capacityDefault: true },
  // Do not match bare "purchase agreement" (too common in selling-shareholder / PIPE SPA text).
  {
    type: 'equity_line',
    re: /\bequity\s+line(?:\s+purchase\s+agreement)?\b|\bELOC\b|\bYorkville\b|\bshare\s+purchase\s+agreement\b/i,
    capacityDefault: true,
  },
  { type: 'registered_direct', re: /\bregistered\s+direct\b/i, capacityDefault: false },
  {
    type: 'private_placement',
    re: /\bprivate\s+placement(?:\s+financing)?\b|\bsecurities\s+purchase\s+agreement\b|\b(?:closed|closing)\s+(?:the\s+)?(?:private\s+placement|PIPE)\b/i,
    capacityDefault: false,
  },
  { type: 'convertible_note', re: /\bconvertible\s+(?:notes?|debentures?|debt)\b|\bconversion\s+price\b|\blowest\s+daily\s+VWAP\b/i, capacityDefault: true },
  { type: 'note_conversion', re: /\bconversion\s+of\s+(?:the\s+)?(?:notes?|debentures?)\b|\bconverted\s+into\s+.*common\s+stock\b/i, capacityDefault: false },
  { type: 'debt_for_equity', re: /\bdebt.{0,40}common\s+stock\b|\bexchanged?\s+.{0,40}(?:debt|notes?).{0,40}(?:shares|common\s+stock)\b/i, capacityDefault: false },
  { type: 'warrant_exercise', re: /\bwarrants?\s+to\s+purchase\b|\bwarrant\s+exercis/i, capacityDefault: false },
  { type: 'prospectus_supplement', re: /\bprospectus\s+supplement\b/i, capacityDefault: true },
  { type: 'shelf_registration', re: /\bshelf\s+registration\b|\bregistration\s+statement\b|\bon\s+Form\s+S-3\b|\bon\s+Form\s+F-3\b/i, capacityDefault: true },
  { type: 'reverse_split', re: /\breverse\s+stock\s+split\b|\breverse\s+split\b/i, capacityDefault: false },
  { type: 'nasdaq_deficiency', re: /\bminimum\s+bid\s+price\b|\bstockholders['']\s+equity\b.{0,40}deficiency|\bNasdaq\s+deficiency\b|\breceived\s+a\s+notification\s+letter\s+from\s+Nasdaq\b/i, capacityDefault: false },
  { type: 'nasdaq_compliance', re: /\bregained\s+compliance\b|\bhas\s+regained\s+compliance\b|\bnow\s+in\s+compliance\s+with\s+.*(?:bid\s+price|stockholders['']\s+equity)\b/i, capacityDefault: false },
  { type: 'going_concern', re: /\bgoing\s+concern\b|\bsubstantial\s+doubt\b/i, capacityDefault: false },
];

const ISSUANCE_VERBS =
  /\b(?:issued|sold|sells|selling|agreed\s+to\s+sell|closed\s+the\s+sale|completed\s+the\s+sale|purchased\s+from\s+the\s+company|shares\s+were\s+issued)\b/i;

const VARIABLE_VWAP =
  /\b(?:lowest\s+daily\s+VWAP|variable\s+conversion|discount(?:ed)?\s+(?:to\s+)?(?:the\s+)?(?:VWAP|market)|%\s*of\s+(?:the\s+)?(?:lowest|average)\s+(?:daily\s+)?VWAP)\b/i;

const SELLING_SHAREHOLDER =
  /\bselling\s+shareholders?\b|\bresale\s+(?:of|by)\b|\bregistered\s+for\s+resale\b|\bon\s+behalf\s+of\s+(?:the\s+)?selling\b/i;

const COMPANY_SIDE_ATM_ELOC =
  /\b(?:at[\s-]+the[\s-]+market|atm\s+(?:offering|program)|equity\s+line|ELOC|Yorkville)\b/i;

const RETROSPECTIVE_REVERSE_SPLIT =
  /\bretrospectively\s+restated\b|\bas\s+adjusted\s+for\b.{0,60}reverse\s+(?:stock\s+)?split\b|\bgive\s+effect\s+to\b.{0,60}reverse\s+(?:stock\s+)?split\b|\bafter\s+(?:giving\s+)?effect\s+to\b.{0,60}reverse\s+(?:stock\s+)?split\b|\bsee\s+Note\s+\d+.{0,40}reverse\s+(?:stock\s+)?split\b|\b\*+\s*.{0,40}reverse\s+(?:stock\s+)?split\b/i;

const EFFECTED_REVERSE_SPLIT =
  /\b(?:effected|effectuate[sd]?|completed|consummated|implemented)\s+(?:a\s+)?(?:\d[\d,]*[\s-]*for[\s-]*\d[\d,]*\s+)?reverse\s+(?:stock\s+)?split\b|\breverse\s+(?:stock\s+)?split\s+(?:became|was)\s+effective\b/i;

const UPCOMING_REVERSE_SPLIT =
  /\bboard\s+(?:of\s+directors\s+)?(?:has\s+)?approved\s+(?:a\s+)?reverse\s+(?:stock\s+)?split\b|\b(?:expected\s+to\s+be\s+effective|becomes?\s+effective|effective\s+(?:on|as\s+of)).{0,80}reverse\s+(?:stock\s+)?split\b|\breverse\s+(?:stock\s+)?split.{0,80}(?:expected\s+to\s+be\s+effective|becomes?\s+effective)\b/i;

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
  const stripped = input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return cleanFilingText(stripped);
}

function clipExcerpt(text: string, index: number, matchLen: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + matchLen + 160);
  let excerpt = text.slice(start, end).trim();
  if (start > 0) excerpt = '…' + excerpt;
  if (end < text.length) excerpt = excerpt + '…';
  return cleanFilingText(excerpt, MAX_EXCERPT);
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
    if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  }
  const shares = window.match(
    /([\d,]+(?:\.\d+)?)\s*(million|m)?\s*(?:shares|share)/i
  );
  if (shares) {
    let n = parseFloat(shares[1].replace(/,/g, ''));
    const unit = (shares[2] || '').toLowerCase();
    if (unit === 'million' || unit === 'm') n *= 1_000_000;
    if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Only attach finite numeric fields — NaN/null must never reach JSON (serializes as null). */
function finiteOrUndefined(n: number | undefined): number | undefined {
  if (n === undefined || n === null || !Number.isFinite(n)) return undefined;
  return n;
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
    private_placement: 'Private placement',
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

  if (
    type === 'registered_direct' ||
    type === 'private_placement' ||
    type === 'note_conversion' ||
    type === 'debt_for_equity' ||
    type === 'warrant_exercise'
  ) {
    const issued =
      ISSUANCE_VERBS.test(window) ||
      /\baggregate\s+purchase\s+price\b/i.test(window) ||
      /\bissued\b|\bsold\b|\bconverted\b/i.test(window);
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
      const contextWindow =
        phrase.type === 'private_placement'
          ? text.slice(idx, Math.min(text.length, idx + 2800))
          : window;
      const hasContext = hasNumericOrDateContext(contextWindow);
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

      // Resale / selling-shareholder SPAs are not company-side private placements
      if (
        type === 'private_placement' &&
        SELLING_SHAREHOLDER.test(window) &&
        !/\bprivate\s+placement\b/i.test(window)
      ) {
        continue;
      }

      // Skip "non-convertible" loan language
      if (
        type === 'convertible_note' &&
        /\bnon[\s-]*convertible\b/i.test(
          text.slice(Math.max(0, idx - 20), idx + match[0].length + 20)
        )
      ) {
        continue;
      }

      const { capacityOnly, isIssuance } = classifyIssuance(
        type,
        phrase.capacityDefault,
        type === 'private_placement'
          ? text.slice(idx, Math.min(text.length, idx + 2800))
          : window,
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

      const numericWindow =
        type === 'private_placement'
          ? text.slice(idx, Math.min(text.length, idx + 2800))
          : window;

      const amount = parseNumberNear(numericWindow);
      const sharesMatch = numericWindow.match(
        /([\d,]+(?:\.\d+)?)\s*(million|m)?\s*(?:[\w-]+\s+){0,6}(?:shares|share)/i
      );
      let shares: number | undefined;
      if (sharesMatch) {
        shares = parseFloat(sharesMatch[1].replace(/,/g, ''));
        if ((sharesMatch[2] || '').toLowerCase().startsWith('m')) shares *= 1_000_000;
        shares = finiteOrUndefined(shares);
      }

      const moneyMatch = numericWindow.match(
        /\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion|m|b)?/i
      );
      let proceeds: number | undefined;
      if (type === 'private_placement') {
        const aggMatch = numericWindow.match(
          /\baggregate\s+purchase\s+price\s+of\s+\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion|m|b)?/i
        );
        if (aggMatch) {
          proceeds = parseFloat(aggMatch[1].replace(/,/g, ''));
          const unit = (aggMatch[2] || '').toLowerCase();
          if (unit === 'million' || unit === 'm') proceeds *= 1_000_000;
          if (unit === 'billion' || unit === 'b') proceeds *= 1_000_000_000;
          proceeds = finiteOrUndefined(proceeds);
        }
      }
      if (proceeds === undefined && moneyMatch && /\$/.test(numericWindow)) {
        proceeds = parseFloat(moneyMatch[1].replace(/,/g, ''));
        const unit = (moneyMatch[2] || '').toLowerCase();
        if (unit === 'million' || unit === 'm') proceeds *= 1_000_000;
        if (unit === 'billion' || unit === 'b') proceeds *= 1_000_000_000;
        proceeds = finiteOrUndefined(proceeds);
      }

      const verifiedAt = new Date().toISOString();
      let title = titleFor(finalType, capacityOnly && !isIssuance);
      let scoreEligible = true;
      let isSellingShareholder = false;
      let isRetrospective = false;
      let isUpcoming = false;
      let eventConfidence = confidence;

      // Selling-shareholder / resale registrations are not company ATM/ELOC capacity
      if (
        (finalType === 'atm_program' ||
          finalType === 'equity_line' ||
          finalType === 'shelf_registration' ||
          finalType === 'prospectus_supplement') &&
        SELLING_SHAREHOLDER.test(window) &&
        !COMPANY_SIDE_ATM_ELOC.test(window)
      ) {
        isSellingShareholder = true;
        scoreEligible = false;
        eventConfidence = 'needs_review';
        title = `${title} (selling shareholder)`;
      }

      // Prefer company-side ATM/ELOC language; bare SPA with selling shareholders already handled
      if (
        (finalType === 'atm_program' || finalType === 'equity_line') &&
        SELLING_SHAREHOLDER.test(window) &&
        COMPANY_SIDE_ATM_ELOC.test(window)
      ) {
        // Company facility mentioned alongside selling shareholders — keep scoreable if high confidence
      }

      // Retrospective reverse-split footnotes: timeline only, never +10
      if (finalType === 'reverse_split') {
        const rsWindow = text.slice(idx, Math.min(text.length, idx + 2800));
        const retrospective = RETROSPECTIVE_REVERSE_SPLIT.test(rsWindow);
        const effected = EFFECTED_REVERSE_SPLIT.test(rsWindow);
        const upcoming = UPCOMING_REVERSE_SPLIT.test(rsWindow);
        if (retrospective && !effected) {
          isRetrospective = true;
          scoreEligible = false;
          title = 'Reverse stock split (retrospective footnote)';
        } else if (upcoming && !effected) {
          isUpcoming = true;
          scoreEligible = false;
          title = 'Reverse stock split (upcoming)';
        } else if (!effected && !hasDateNear(rsWindow)) {
          scoreEligible = false;
          eventConfidence = 'needs_review';
        }
      }

      // Prefer Item-like operative 8-K context for financing (soft boost already via confidence)
      const event: CapitalEvent = {
        id: `${doc.accessionNumber || doc.filingDate}-${finalType}-${eventIdx++}`,
        eventDate: doc.filingDate,
        type: finalType,
        title,
        description: cleanFilingText(excerpt, 200),
        isCapacityOnly: capacityOnly && !isIssuance,
        scoreEligible,
        isSellingShareholder: isSellingShareholder || undefined,
        isRetrospective: isRetrospective || undefined,
        isUpcoming: isUpcoming || undefined,
        filedAt: doc.filingDate,
        verifiedAt,
        evidence: makeEvidence(doc, excerpt, eventConfidence),
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

      if (finalType === 'nasdaq_deficiency' || finalType === 'nasdaq_compliance') {
        const blob = `${title} ${event.description} ${excerpt}`;
        const cureDate = extractNasdaqCureDate(blob, doc.filingDate);
        if (cureDate) event.cureDate = cureDate;
      }
      const certainty = inferEventCertainty(event);
      if (certainty) event.certainty = certainty;

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
