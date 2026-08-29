import type { CapitalEvent } from './types';

export type UpcomingReverseSplitInfo = {
  effectiveDate: string;
  ratio?: string;
  source: 'edgar' | 'polygon';
  summary: string;
  documentUrl?: string;
};

const UPCOMING_EDGAR =
  /\b(?:approved|subject\s+to\s+(?:stockholder|shareholder)\s+approval).{0,100}reverse\s+(?:stock\s+)?split\b|\breverse\s+(?:stock\s+)?split.{0,120}(?:expected\s+to\s+be\s+effective|becomes?\s+effective|effective\s+(?:on|as\s+of))\b/i;

const EFFECTED =
  /\b(?:effected|effectuate[sd]?|completed|consummated|implemented)\s+(?:a\s+)?(?:\d[\d,]*[\s-]*for[\s-]*\d[\d,]*\s+)?reverse\s+(?:stock\s+)?split\b|\breverse\s+(?:stock\s+)?split\s+(?:became|was)\s+effective\b/i;

const RATIO_IN_TEXT =
  /(\d[\d,]*)\s*(?:[\s-]*for[\s-]*|[:]\s*)(\d[\d,]*)\s+reverse\s+(?:stock\s+)?split/i;

function parseRatioFromText(text: string): string | undefined {
  const m = text.match(RATIO_IN_TEXT) || text.match(/(\d[\d,]*)\s*-\s*for\s*-\s*(\d[\d,]*)/i);
  if (!m) return undefined;
  return `${m[1]}-for-${m[2]}`;
}

function parseEffectiveDate(text: string): string | undefined {
  const month =
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i.exec(
      text
    );
  if (month) return new Date(month[0]).toISOString().slice(0, 10);
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  return iso?.[1];
}

export function detectUpcomingReverseSplitFromEvents(
  events: CapitalEvent[],
  asOf: string
): UpcomingReverseSplitInfo | null {
  const asOfMs = new Date(asOf).getTime();
  for (const e of events) {
    if (e.type !== 'reverse_split' || e.isRetrospective) continue;
    const blob = `${e.title} ${e.description} ${e.evidence.excerpt}`;
    if (EFFECTED.test(blob)) continue;
    if (!UPCOMING_EDGAR.test(blob) && !e.isUpcoming) continue;
    const effectiveDate = parseEffectiveDate(blob) || e.eventDate;
    if (new Date(effectiveDate).getTime() < asOfMs - 86400000) continue;
    return {
      effectiveDate,
      ratio: parseRatioFromText(blob),
      source: 'edgar',
      summary: e.description || e.title,
      documentUrl: e.evidence.documentUrl,
    };
  }
  return null;
}

export function detectUpcomingReverseSplitFromPolygon(
  splits: Array<{ date: string; ratio: string }> | undefined,
  asOf: string
): UpcomingReverseSplitInfo | null {
  if (!splits?.length) return null;
  const today = asOf.slice(0, 10);
  const future = splits
    .filter((s) => s.date > today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = future[0];
  if (!next) return null;
  return {
    effectiveDate: next.date,
    ratio: next.ratio,
    source: 'polygon',
    summary: `Scheduled reverse split (${next.ratio}) per exchange reference data.`,
  };
}

export function mergeUpcomingReverseSplit(
  events: CapitalEvent[],
  polygonSplits: Array<{ date: string; ratio: string }> | undefined,
  asOf: string
): UpcomingReverseSplitInfo | null {
  return (
    detectUpcomingReverseSplitFromEvents(events, asOf) ??
    detectUpcomingReverseSplitFromPolygon(polygonSplits, asOf)
  );
}
