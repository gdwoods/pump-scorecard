import { detectOfferingDisagreement } from './shortCheckBridge';
import type {
  CapitalEvent,
  CapitalEventType,
  CapitalPressureResult,
  CapitalPressureStatus,
  EvidenceStatus,
  RecentIssuanceField,
  ScoreReason,
} from './types';
import type { ExtractedData } from '../shortCheckTypes';
import type { OfferingAbility } from '../fast/types';

const EVENT_LABELS: Record<CapitalEventType, string> = {
  shelf_registration: 'Shelf registration',
  atm_program: 'ATM program',
  equity_line: 'Equity line',
  registered_direct: 'Registered direct',
  private_placement: 'Private placement',
  convertible_note: 'Convertible note',
  note_conversion: 'Note conversion',
  debt_for_equity: 'Debt for equity',
  warrant_exercise: 'Warrant exercise',
  prospectus_supplement: 'Prospectus supplement',
  reverse_split: 'Reverse split',
  nasdaq_deficiency: 'Nasdaq deficiency',
  nasdaq_compliance: 'Nasdaq compliance',
};

export function humanEventType(type: CapitalEventType): string {
  return EVENT_LABELS[type] ?? type.replace(/_/g, ' ');
}

export function statusHeadlineLabel(status: CapitalPressureStatus): string {
  switch (status) {
    case 'high':
      return 'High';
    case 'elevated':
      return 'Elevated';
    case 'watch':
      return 'Watch';
    default:
      return 'Low';
  }
}

export const CP_HEADER_TOOLTIP =
  'SEC filing-derived dilution and listing pressure score. Feeds Quick Scorecard offering/dilution and delisting when verified evidence is available.';

export const CP_SCORE_TOOLTIP =
  '0–100 composite from weighted filing reasons in the scan window (shelf, ATM, issuance, deficiencies, splits). Not a trade recommendation.';

export const CP_STATUS_TOOLTIPS: Record<CapitalPressureStatus, string> = {
  low: 'Few verified dilution or listing signals in the filing window.',
  watch: 'Some financing or compliance signals — monitor filings and issuance.',
  elevated: 'Multiple weighted reasons or recent verified issuance — dilution risk rising.',
  high: 'Strong filing evidence of active or imminent dilution / listing stress.',
};

function hasIssuanceInWindow(ri: RecentIssuanceField | undefined): boolean {
  if (!ri || ri.status === 'unknown') return false;
  const nums = [
    ri.shares7d,
    ri.shares30d,
    ri.shares90d,
    ri.proceeds7dUsd,
    ri.proceeds30dUsd,
    ri.proceeds90dUsd,
  ];
  return nums.some((n) => n != null && Number.isFinite(n) && n > 0);
}

function issuanceTail(data: CapitalPressureResult): string {
  const ri = data.recentIssuance;
  if (!ri || ri.status === 'unknown') {
    return 'issuance not verified in scanned filings';
  }
  if (!hasIssuanceInWindow(ri)) {
    return 'no verified issuance in the last 90 days';
  }
  if (ri.shares30d != null && ri.shares30d > 0) {
    return 'verified issuance in the last 30 days';
  }
  if (ri.shares90d != null && ri.shares90d > 0) {
    return 'verified issuance in the last 90 days';
  }
  return 'recent issuance verified in scan window';
}

function capacityTail(data: CapitalPressureResult): string {
  const cap = data.capacity;
  if (!cap || cap.status === 'unknown') {
    return 'financing capacity not verified from filings';
  }
  const label = cap.description?.toLowerCase() ?? '';
  if (/atm|equity line|shelf|registered/i.test(label) || data.reasons.some((r) => /ATM|shelf|ELOC/i.test(r.label))) {
    return 'documented financing capacity on file';
  }
  return cap.description || 'capacity noted in filings';
}

/** Plain-English one-liner for the card header. */
export function buildCapitalPressureHeadline(data: CapitalPressureResult): string {
  const status = statusHeadlineLabel(data.status);
  const top = data.reasons[0]?.label;
  const issuance = issuanceTail(data);
  const capacity = capacityTail(data);

  if (data.status === 'low' && !hasIssuanceInWindow(data.recentIssuance)) {
    return `${status} — ${issuance}; ${capacity}.`;
  }
  if (top) {
    return `${status} — ${top}; ${issuance}.`;
  }
  return `${status} — ${capacity}; ${issuance}.`;
}

export function evidenceAvailabilityText(
  status: EvidenceStatus,
  kind: 'field' | 'issuance' = 'field'
): string {
  switch (status) {
    case 'reported':
      return kind === 'issuance' ? 'No issuance in 90d (verified)' : 'Verified from filings';
    case 'partial':
      return 'Partially verified';
    case 'not_applicable':
      return 'Not applicable';
    default:
      return 'Not in scanned filings';
  }
}

export function formatSharesShort(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatUsdShort(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export function issuanceWindowSummary(ri: RecentIssuanceField | undefined): {
  d7: string;
  d30: string;
  d90: string;
} {
  if (!ri || ri.status === 'unknown') {
    const unk = 'Not in scanned filings';
    return { d7: unk, d30: unk, d90: unk };
  }
  if (!hasIssuanceInWindow(ri)) {
    const none = 'No issuance (verified)';
    return { d7: none, d30: none, d90: none };
  }
  const fmt = (sh?: number | null, pr?: number | null) => {
    const hasS = sh != null && Number.isFinite(sh) && sh > 0;
    const hasP = pr != null && Number.isFinite(pr) && pr > 0;
    if (hasS && hasP) return `${formatSharesShort(sh)} / ${formatUsdShort(pr)}`;
    if (hasS) return formatSharesShort(sh);
    if (hasP) return formatUsdShort(pr);
    return 'None (verified)';
  };
  return {
    d7: fmt(ri.shares7d, ri.proceeds7dUsd),
    d30: fmt(ri.shares30d, ri.proceeds30dUsd),
    d90: fmt(ri.shares90d, ri.proceeds90dUsd),
  };
}

/** Capacity vs 90d issued shares (0–1) when both known. */
export function issuanceUtilization(
  data: CapitalPressureResult
): { pct: number; label: string } | null {
  const capShares = data.capacity?.potentialShares;
  const issued90 = data.recentIssuance?.shares90d;
  if (
    capShares == null ||
    !Number.isFinite(capShares) ||
    capShares <= 0 ||
    issued90 == null ||
    !Number.isFinite(issued90)
  ) {
    return null;
  }
  const pct = Math.min(1, issued90 / capShares);
  return {
    pct,
    label: `${formatSharesShort(issued90)} of ${formatSharesShort(capShares)} registered capacity used (90d)`,
  };
}

function dtOfferingLevel(extracted?: ExtractedData | null): OfferingAbility | null {
  const raw = extracted?.atmShelfStatus?.toLowerCase() ?? '';
  if (!raw) return null;
  if (raw.includes('dt:red') || raw.includes('dt:high') || raw.includes('atm active')) return 'HIGH';
  if (raw.includes('dt:medium') || raw.includes('dt:yellow')) return 'MEDIUM';
  if (raw.includes('dt:green') || raw.includes('dt:low') || raw.includes('green')) return 'LOW';
  if (/\b(atm|s-1|s-3|active)\b/.test(raw)) return 'HIGH';
  if (/\b(low|none|green)\b/.test(raw)) return 'LOW';
  return null;
}

export type FrameworkNote = {
  tone: 'ok' | 'warn' | 'info';
  text: string;
};

export function buildFrameworkNote(
  data: CapitalPressureResult,
  opts?: {
    extractedData?: ExtractedData | null;
    capacityQuarters?: number | null;
    derivedOfferingAbility?: OfferingAbility | null;
  }
): FrameworkNote | null {
  const disagreement = detectOfferingDisagreement(opts?.extractedData, data);
  if (disagreement) {
    return { tone: 'warn', text: disagreement };
  }

  const dt = dtOfferingLevel(opts?.extractedData);
  const derived = opts?.derivedOfferingAbility;
  if (dt && derived && dt === derived) {
    return {
      tone: 'ok',
      text: `Aligns with DilutionTracker Offering Ability: ${dt} (SEC scan consistent).`,
    };
  }
  if (dt && derived && dt !== derived) {
    return {
      tone: 'info',
      text: `DT Offering Ability: ${dt}; SEC-derived offering signal: ${derived}. Review both sources.`,
    };
  }
  if (derived) {
    return {
      tone: 'info',
      text: `SEC-derived offering ability: ${derived} (baby-shelf / filing signals).`,
    };
  }

  if (opts?.capacityQuarters != null && Number.isFinite(opts.capacityQuarters)) {
    const q = opts.capacityQuarters;
    const days = Math.round(q * 91.25);
    return {
      tone: 'info',
      text: `Baby-shelf capacity ≈ ${q.toFixed(2)} quarters of burn (~${days} days at current burn).`,
    };
  }

  return null;
}

export function issuanceFieldStatusLabel(ri: RecentIssuanceField | undefined): string {
  if (!ri || ri.status === 'unknown') {
    return evidenceAvailabilityText('unknown', 'issuance');
  }
  if (!hasIssuanceInWindow(ri)) {
    return evidenceAvailabilityText('reported', 'issuance');
  }
  return 'Verified from filings';
}

export function buildCardCopySummary(ticker: string, data: CapitalPressureResult): string {
  const lines = [
    `${ticker} Capital Pressure — ${data.score}/100 (${data.status})`,
    buildCapitalPressureHeadline(data),
    data.summary,
  ];
  const top = data.reasons[0];
  if (top) {
    lines.push(`Top reason (+${top.points}): ${top.label}`);
    if (top.evidence?.documentUrl) lines.push(top.evidence.documentUrl);
  }
  const windows = issuanceWindowSummary(data.recentIssuance);
  lines.push(`7d: ${windows.d7} | 30d: ${windows.d30} | 90d: ${windows.d90}`);
  return lines.filter(Boolean).join('\n');
}

export function findPinnedEvent(
  events: CapitalEvent[],
  topReason?: ScoreReason
): CapitalEvent | undefined {
  if (!topReason?.evidence) return undefined;
  const acc = topReason.evidence.accessionNumber;
  const url = topReason.evidence.documentUrl;
  const form = topReason.evidence.form;
  const date = topReason.evidence.filingDate;

  return (
    events.find(
      (e) =>
        (acc && e.evidence?.accessionNumber === acc) ||
        (url && e.evidence?.documentUrl === url)
    ) ||
    events.find((e) => e.evidence?.form === form && e.evidence?.filingDate === date)
  );
}
