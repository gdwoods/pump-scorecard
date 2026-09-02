import type { CapitalEvent } from './types';
import type { EventCertainty } from './types';
import type { UpcomingReverseSplitInfo } from './upcomingReverseSplit';

const CONTINGENT =
  /\b(?:subject\s+to\s+(?:stockholder|shareholder)\s+approval|if\s+approved|contingent\s+upon|may\s+elect\s+to|optional\s+redemption|at\s+the\s+option\s+of|holder(?:s)?\s+(?:may|could)\s+(?:redeem|convert))\b/i;

const CONFIRMED_DATE =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i;

function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function parseMonthDate(text: string): string | undefined {
  const explicit = CONFIRMED_DATE.exec(text);
  if (!explicit) return undefined;
  const parsed = new Date(`${explicit[0].replace(',', '')} UTC`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

/** Extract Nasdaq bid-price or compliance cure deadline (~180 days from notice). */
export function extractNasdaqCureDate(text: string, filingDate: string): string | undefined {
  const explicit = parseMonthDate(text);
  if (explicit) return explicit;

  const daysMatch = /\b(\d{1,3})\s*(?:calendar\s+)?days?\b/i.exec(text);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    if (days >= 30 && days <= 365) {
      return addCalendarDays(filingDate, days);
    }
  }
  if (/\b180\s*(?:calendar\s+)?days?\b/i.test(text)) {
    return addCalendarDays(filingDate, 180);
  }
  return undefined;
}

export function inferEventCertainty(event: CapitalEvent): EventCertainty | undefined {
  if (event.certainty) return event.certainty;

  const blob = `${event.title} ${event.description} ${event.evidence?.excerpt ?? ''}`;

  if (event.type === 'nasdaq_deficiency' || event.type === 'nasdaq_compliance') {
    const cureDate = event.cureDate ?? extractNasdaqCureDate(blob, event.eventDate);
    if (cureDate && !CONTINGENT.test(blob)) return 'set';
    if (CONTINGENT.test(blob)) return 'possible';
    if (cureDate) return 'set';
    return 'possible';
  }

  if (event.type === 'reverse_split') {
    if (event.isUpcoming) {
      return CONTINGENT.test(blob) ? 'possible' : 'set';
    }
    if (event.isRetrospective) return undefined;
    return CONFIRMED_DATE.test(blob) && !CONTINGENT.test(blob) ? 'set' : 'possible';
  }

  if (event.type === 'convertible_note' && CONTINGENT.test(blob)) {
    return 'possible';
  }

  return undefined;
}

export function inferUpcomingReverseSplitCertainty(
  info: UpcomingReverseSplitInfo
): EventCertainty {
  if (info.certainty) return info.certainty;
  const blob = `${info.summary} ${info.ratio ?? ''}`;
  return CONTINGENT.test(blob) ? 'possible' : 'set';
}
