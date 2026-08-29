/**
 * Capital Pressure scoring (0–100) + dilutionLikelihood / shortExecutionRisk (0–10).
 * Unverified criteria score 0 and appear in unknowns. Never treat missing as zero risk evidence.
 */

import {
  hasFixedPriceConvertible,
  hasVariableVwapConvertible,
} from './capitalPressure/parse';
import { unavailableCapitalPressure } from './capitalPressure/unavailable';
import type {
  CapitalEvent,
  CapitalPressureFundamentals,
  CapitalPressureResult,
  CapitalPressureScanContext,
  CapitalPressureStatus,
  CapacityField,
  ParsedCapitalPressure,
  RecentIssuanceField,
  ScoreReason,
  SecEvidence,
  SharesOutstandingField,
} from './capitalPressure/types';

const MS_DAY = 24 * 60 * 60 * 1000;

function finiteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

const BULLISH_NEWS_KEYWORDS = [
  'partnership',
  'approval',
  'fda approval',
  'contract',
  'major contract',
  'revenue growth',
  'strategic',
  'strategic partnership',
  'breakthrough',
  'acquisition',
  'merger',
  'deal',
  'profit',
  'earnings beat',
  'guidance raise',
  'positive',
  'expands',
];

function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.floor((b - a) / MS_DAY);
}

function statusFromScore(score: number): CapitalPressureStatus {
  if (score >= 75) return 'high';
  if (score >= 50) return 'elevated';
  if (score >= 25) return 'watch';
  return 'low';
}

function summaryForStatus(status: CapitalPressureStatus): string {
  switch (status) {
    case 'high':
      return 'High capital pressure: recent filings show financing capacity or share-supply activity alongside balance-sheet or listing pressure. Verify each linked filing before acting.';
    case 'elevated':
      return 'Elevated capital pressure: filings document financing capacity and/or recent share-supply activity with balance-sheet signals. Verify each linked filing before acting.';
    case 'watch':
      return 'Watch: some documented financing capacity or capital-structure signals appear in recent filings. Evidence is limited — verify linked filings.';
    default:
      return 'Low documented dilution pressure: no scoreable financing need plus issuance-capacity combination was verified from available filings.';
  }
}

function highConfidence(e: CapitalEvent): boolean {
  return e.evidence.confidence === 'high' && e.scoreEligible !== false;
}

function isCompanySideAtmElines(e: CapitalEvent): boolean {
  return (
    highConfidence(e) &&
    (e.type === 'atm_program' || e.type === 'equity_line') &&
    !e.isSellingShareholder
  );
}

function withinDays(eventDate: string, asOf: string, days: number): boolean {
  const d = daysBetween(eventDate, asOf);
  return d >= 0 && d <= days;
}

function sumIssuance(
  events: CapitalEvent[],
  asOf: string,
  days: number
): { shares?: number; proceeds?: number } {
  let shares = 0;
  let proceeds = 0;
  let hasShares = false;
  let hasProceeds = false;
  const seen = new Set<string>();

  for (const e of events) {
    if (e.isCapacityOnly) continue;
    if (!highConfidence(e)) continue;
    const issuedShares = finiteNum(e.sharesIssued) ? e.sharesIssued : undefined;
    const issuedProceeds = finiteNum(e.grossProceedsUsd) ? e.grossProceedsUsd : undefined;
    if (issuedShares === undefined && issuedProceeds === undefined) continue;
    // Only count types that represent actual issuance
    if (
      ![
        'registered_direct',
        'private_placement',
        'note_conversion',
        'debt_for_equity',
        'warrant_exercise',
        'prospectus_supplement',
        'equity_line',
        'atm_program',
      ].includes(e.type)
    ) {
      continue;
    }
    if (!withinDays(e.eventDate, asOf, days)) continue;

    // De-dupe the same economic issuance reported across 8-K + 424B
    const dedupeKey = [
      e.eventDate,
      issuedShares ?? '',
      issuedProceeds ?? '',
      e.type === 'prospectus_supplement' ? 'supplement' : e.type,
    ].join('|');
    // Treat equity_line / atm_program / prospectus_supplement on same date+shares as one
    const softKey = [e.eventDate, issuedShares ?? '', issuedProceeds ?? ''].join('|');
    if (seen.has(dedupeKey) || seen.has(softKey)) continue;
    seen.add(dedupeKey);
    seen.add(softKey);

    if (issuedShares !== undefined) {
      shares += issuedShares;
      hasShares = true;
    }
    if (issuedProceeds !== undefined) {
      proceeds += issuedProceeds;
      hasProceeds = true;
    }
  }
  return {
    shares: hasShares ? shares : undefined,
    proceeds: hasProceeds ? proceeds : undefined,
  };
}

function buildCapacity(events: CapitalEvent[]): CapacityField {
  const capacityEvents = events.filter(
    (e) =>
      highConfidence(e) &&
      e.isCapacityOnly &&
      !e.isSellingShareholder &&
      ['shelf_registration', 'atm_program', 'equity_line', 'convertible_note', 'prospectus_supplement'].includes(
        e.type
      )
  );
  if (capacityEvents.length === 0) {
    return {
      status: 'unknown',
      description: 'Not verified from available filings',
    };
  }
  let potentialShares = 0;
  let amountUsd = 0;
  let hasShares = false;
  let hasAmount = false;
  for (const e of capacityEvents) {
    if (finiteNum(e.potentialShares)) {
      potentialShares += e.potentialShares;
      hasShares = true;
    }
    if (finiteNum(e.grossProceedsUsd)) {
      amountUsd += e.grossProceedsUsd;
      hasAmount = true;
    }
  }
  const types = [...new Set(capacityEvents.map((e) => e.title))].join('; ');
  const status = hasShares || hasAmount ? 'reported' : 'partial';
  return {
    status,
    description: types || 'Registered or contractual financing capacity disclosed',
    potentialShares: hasShares ? potentialShares : undefined,
    amountUsd: hasAmount ? amountUsd : undefined,
    evidence: capacityEvents[0].evidence,
  };
}

function buildRecentIssuance(events: CapitalEvent[], asOf: string): RecentIssuanceField {
  const s7 = sumIssuance(events, asOf, 7);
  const s30 = sumIssuance(events, asOf, 30);
  const s90 = sumIssuance(events, asOf, 90);
  if (
    s7.shares === undefined &&
    s30.shares === undefined &&
    s90.shares === undefined &&
    s7.proceeds === undefined &&
    s30.proceeds === undefined &&
    s90.proceeds === undefined
  ) {
    // Check if we scanned issuance-capable forms but found none
    return { status: 'unknown' };
  }
  return {
    status: 'reported',
    shares7d: s7.shares,
    shares30d: s30.shares,
    shares90d: s90.shares,
    proceeds7dUsd: s7.proceeds,
    proceeds30dUsd: s30.proceeds,
    proceeds90dUsd: s90.proceeds,
  };
}

function buildSharesOutstanding(
  fundamentals: CapitalPressureFundamentals
): SharesOutstandingField {
  if (fundamentals.sharesOutstanding === undefined) {
    return { status: 'unknown' };
  }
  return {
    status: 'reported',
    value: fundamentals.sharesOutstanding,
    asOf: fundamentals.sharesOutstandingAsOf,
    evidence: fundamentals.sharesOutstandingEvidence,
  };
}

function placeholderEvidence(label: string): SecEvidence {
  return {
    form: 'N/A',
    filingDate: '',
    documentUrl: '',
    excerpt: label,
    confidence: 'needs_review',
  };
}

function scoreShortExecutionRisk(
  events: CapitalEvent[],
  ctx: CapitalPressureScanContext,
  asOf: string
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  const recentRs = events.some(
    (e) =>
      e.type === 'reverse_split' &&
      highConfidence(e) &&
      !e.isRetrospective &&
      withinDays(e.eventDate, asOf, 90)
  );
  if (recentRs) {
    score += 2;
    notes.push('Reverse split in last 90 days (+2)');
  }

  const floatMissing =
    ctx.floatShares === undefined || ctx.floatShares === null;
  const floatStale =
    !floatMissing &&
    !!ctx.floatAsOf &&
    daysBetween(ctx.floatAsOf, asOf) > 90;
  if (floatMissing || floatStale) {
    score += 2;
    notes.push(
      floatMissing
        ? 'Float unavailable (+2)'
        : 'Float older than 90 days (+2)'
    );
  }

  const shortMissing = ctx.shortFloat === undefined || ctx.shortFloat === null;
  const borrowMissing =
    !ctx.borrowFee ||
    ctx.borrowFee === 'Manual Check' ||
    ctx.borrowAvailable === 'Manual Check';
  if (shortMissing || borrowMissing) {
    score += 2;
    notes.push('Short interest or borrow data unavailable (+2)');
  }

  // High-impact catalyst: Short Check bullish walk-away window (7 days)
  const news = ctx.news || [];
  const sevenDaysAgo = new Date(asOf).getTime() - 7 * MS_DAY;
  const hasBullish = news.some((n) => {
    const title = (n.title || n.headline || '').toLowerCase();
    const dateStr = n.date || n.publishedAt;
    if (!title || !dateStr) return false;
    const t = new Date(dateStr).getTime();
    if (Number.isNaN(t) || t < sevenDaysAgo) return false;
    return BULLISH_NEWS_KEYWORDS.some((k) => title.includes(k));
  });
  if (hasBullish) {
    score += 2;
    notes.push('Recent high-impact news catalyst (+2)');
  }

  // Droppiness spikes often hold
  const dropScore = ctx.droppinessScore;
  const spikeCount = ctx.droppinessSpikeCount ?? 0;
  if (
    dropScore !== undefined &&
    dropScore !== null &&
    dropScore < 40 &&
    spikeCount > 0
  ) {
    score += 2;
    notes.push('Droppiness: spikes often hold (+2)');
  }

  return { score: Math.min(10, score), notes };
}

export type ScoreCapitalPressureInput = {
  parsed?: ParsedCapitalPressure | null;
  unavailableReason?: string;
  context?: CapitalPressureScanContext;
};

/**
 * Main entry: score parsed SEC evidence (+ scan context for execution risk).
 */
export function scoreCapitalPressure(
  input: ScoreCapitalPressureInput
): CapitalPressureResult {
  const asOf = input.context?.asOf || new Date().toISOString().slice(0, 10);

  if (input.unavailableReason || !input.parsed) {
    const base = unavailableCapitalPressure(
      input.unavailableReason || 'SEC filings unavailable',
      asOf
    );
    // Execution risk may still use non-SEC fields
    const exec = scoreShortExecutionRisk([], input.context || {}, asOf);
    return {
      ...base,
      shortExecutionRisk: exec.score,
      scannedThrough: asOf,
    };
  }

  const { events, fundamentals, windowStart, windowEnd, scannedThrough, partial } =
    input.parsed;
  const reasons: ScoreReason[] = [];
  const unknowns: string[] = [];
  let score = 0;

  const addReason = (label: string, points: number, evidence: SecEvidence) => {
    if (points <= 0) return;
    reasons.push({ label, points, evidence });
    score += points;
  };

  // --- Going concern (25) — latest 10-Q/10-K explicit language only
  if (fundamentals.goingConcern?.present && fundamentals.goingConcern.evidence) {
    if (fundamentals.goingConcern.evidence.confidence === 'high') {
      addReason(
        'Explicit going-concern / substantial-doubt language in latest 10-Q/10-K',
        25,
        fundamentals.goingConcern.evidence
      );
    } else {
      unknowns.push('Going-concern language needs review (no automatic points)');
    }
  } else if (fundamentals.goingConcern?.present === false) {
    // Verified absent — not an unknown
  } else {
    unknowns.push('Going-concern language not verified from latest 10-Q/10-K');
  }

  // --- Cash runway under 6 months (15) — require dated cash AND OCF (outflow)
  if (
    fundamentals.cashUsd !== undefined &&
    fundamentals.cashAsOf &&
    fundamentals.operatingCashFlowUsd !== undefined &&
    fundamentals.ocfAsOf
  ) {
    const ocf = fundamentals.operatingCashFlowUsd;
    if (ocf < 0) {
      // Quarterly OCF → monthly burn ≈ |OCF|/3
      const monthlyBurn = Math.abs(ocf) / 3;
      const runwayMonths = monthlyBurn > 0 ? fundamentals.cashUsd / monthlyBurn : Infinity;
      if (runwayMonths < 6) {
        const ev: SecEvidence = {
          form: 'XBRL',
          filingDate: fundamentals.cashAsOf,
          documentUrl: '',
          excerpt: `Cash $${fundamentals.cashUsd.toLocaleString()} as of ${fundamentals.cashAsOf}; OCF $${ocf.toLocaleString()} as of ${fundamentals.ocfAsOf}; implied runway ~${runwayMonths.toFixed(1)} months.`,
          confidence: 'high',
        };
        addReason('Cash runway under 6 months (dated cash and operating cash flow)', 15, ev);
      }
    }
    // Positive OCF → no runway pressure points
  } else {
    unknowns.push('Cash runway not verified (requires dated cash and operating cash flow)');
  }

  // --- Negative working capital >25% of total assets (12)
  if (
    fundamentals.currentAssetsUsd !== undefined &&
    fundamentals.currentLiabilitiesUsd !== undefined &&
    fundamentals.totalAssetsUsd !== undefined &&
    fundamentals.totalAssetsUsd > 0
  ) {
    const wc = fundamentals.currentAssetsUsd - fundamentals.currentLiabilitiesUsd;
    const ratio = wc / fundamentals.totalAssetsUsd;
    if (wc < 0 && Math.abs(ratio) > 0.25) {
      const ev: SecEvidence = {
        form: 'XBRL',
        filingDate: fundamentals.balanceSheetAsOf || '',
        documentUrl: '',
        excerpt: `Working capital (CA − CL) = ${wc.toLocaleString()}; total assets = ${fundamentals.totalAssetsUsd.toLocaleString()}; WC/assets = ${(ratio * 100).toFixed(1)}%.`,
        confidence: 'high',
      };
      addReason('Negative working capital >25% of total assets', 12, ev);
    }
  } else {
    unknowns.push('Working capital vs assets not verified from balance-sheet XBRL');
  }

  // --- Active ATM / ELOC / equity line (18) +4 draw in 30d, cap 22
  // Selling-shareholder / resale registrations do not count as company financing capacity.
  const atmOrElines = events.filter(isCompanySideAtmElines);
  if (atmOrElines.length > 0) {
    let atmPoints = 18;
    const draw = atmOrElines.find(
      (e) =>
        !e.isCapacityOnly &&
        e.sharesIssued !== undefined &&
        withinDays(e.eventDate, asOf, 30)
    );
    // Also treat equity_line/atm with issuance verbs in last 30d
    const recentDraw =
      draw ||
      events.find(
        (e) =>
          isCompanySideAtmElines(e) &&
          !e.isCapacityOnly &&
          withinDays(e.eventDate, asOf, 30) &&
          (e.sharesIssued !== undefined || e.grossProceedsUsd !== undefined)
      );
    if (recentDraw) atmPoints = Math.min(22, atmPoints + 4);
    const evidence = (recentDraw || atmOrElines[0]).evidence;
    addReason(
      recentDraw
        ? 'Active ATM/ELOC/equity line with confirmed draw in last 30 days'
        : 'Active ATM, ELOC, or equity line',
      atmPoints,
      evidence
    );
  } else {
    unknowns.push('ATM / ELOC / equity line not verified');
  }

  // --- Effective shelf S-3/F-3 (10) — capacity only
  const shelf = events.find(
    (e) =>
      highConfidence(e) &&
      e.type === 'shelf_registration' &&
      e.isCapacityOnly !== false
  );
  if (shelf) {
    addReason('Effective shelf S-3/F-3 (capacity only)', 10, shelf.evidence);
  } else {
    unknowns.push('Effective shelf S-3/F-3 not verified');
  }

  // --- Registered direct in last 90 days (18)
  const rd = events.find(
    (e) =>
      highConfidence(e) &&
      e.type === 'registered_direct' &&
      !e.isCapacityOnly &&
      withinDays(e.eventDate, asOf, 90)
  );
  if (rd) {
    addReason('Registered direct in last 90 days', 18, rd.evidence);
  } else {
    unknowns.push('Registered direct in last 90 days not verified');
  }

  // --- Private placement in last 90 days (18)
  const pp = events.find(
    (e) =>
      highConfidence(e) &&
      e.type === 'private_placement' &&
      !e.isCapacityOnly &&
      withinDays(e.eventDate, asOf, 90)
  );
  if (pp) {
    addReason('Private placement in last 90 days', 18, pp.evidence);
  } else {
    unknowns.push('Private placement in last 90 days not verified');
  }

  // --- Convertible debt variable/discounted VWAP (18) or fixed (10)
  const convertibles = events.filter(
    (e) => highConfidence(e) && e.type === 'convertible_note'
  );
  if (convertibles.length > 0) {
    if (hasVariableVwapConvertible(events)) {
      addReason(
        'Convertible debt with variable/discounted-VWAP conversion',
        18,
        convertibles[0].evidence
      );
    } else if (hasFixedPriceConvertible(events)) {
      addReason('Convertible debt with fixed conversion price', 10, convertibles[0].evidence);
    } else {
      // Present but terms unclear — needs_review style, no auto points; still unknown terms
      unknowns.push('Convertible debt terms (variable vs fixed) not verified');
    }
  } else {
    unknowns.push('Convertible debt not verified');
  }

  // --- Debt-for-equity in last 90 days (15)
  const dfe = events.find(
    (e) =>
      highConfidence(e) &&
      e.type === 'debt_for_equity' &&
      withinDays(e.eventDate, asOf, 90)
  );
  if (dfe) {
    addReason('Debt-for-equity settlement in last 90 days', 15, dfe.evidence);
  } else {
    unknowns.push('Debt-for-equity settlement in last 90 days not verified');
  }

  // --- Reverse split in last 180 days (10) — do not double-count as financing
  // Retrospective footnotes are timeline-only (scoreEligible=false via parser).
  const rs = events.find(
    (e) =>
      highConfidence(e) &&
      e.type === 'reverse_split' &&
      !e.isRetrospective &&
      withinDays(e.eventDate, asOf, 180)
  );
  if (rs) {
    addReason('Reverse split in last 180 days', 10, rs.evidence);
  } else {
    unknowns.push('Reverse split in last 180 days not verified');
  }

  // --- Active Nasdaq deficiency (8) — resolved compliance is timeline-only
  const deficiency = events.find(
    (e) => highConfidence(e) && e.type === 'nasdaq_deficiency'
  );
  const compliance = events.find(
    (e) => highConfidence(e) && e.type === 'nasdaq_compliance'
  );
  // Active if deficiency exists and no later compliance
  if (deficiency) {
    const resolved =
      compliance && compliance.eventDate >= deficiency.eventDate;
    if (!resolved) {
      addReason('Active Nasdaq deficiency', 8, deficiency.evidence);
    }
  } else {
    unknowns.push('Active Nasdaq deficiency not verified');
  }

  if (partial) {
    unknowns.push('Filing parse budget limited — some documents not fully reviewed');
  }

  // needs_review events: timeline only, no points (already excluded via highConfidence)

  score = Math.min(100, score);
  reasons.sort((a, b) => b.points - a.points);

  // Dilution likelihood: scale score to 0–10 + optional +1 bonus, cap 10
  let dilutionLikelihood = Math.round(score / 10);
  const recentFinancingActivity = events.some(
    (e) =>
      highConfidence(e) &&
      !e.isCapacityOnly &&
      withinDays(e.eventDate, asOf, 30) &&
      ['atm_program', 'equity_line', 'note_conversion', 'prospectus_supplement', 'private_placement'].includes(
        e.type
      )
  );
  if (recentFinancingActivity) {
    dilutionLikelihood = Math.min(10, dilutionLikelihood + 1);
  } else {
    dilutionLikelihood = Math.min(10, dilutionLikelihood);
  }

  const exec = scoreShortExecutionRisk(events, input.context || {}, asOf);
  const status = statusFromScore(score);

  // Filter unknowns that were actually scored (remove contradictory unknowns)
  const scoredLabels = new Set(reasons.map((r) => r.label));
  const cleanedUnknowns = unknowns.filter((u) => {
    if (scoredLabels.size === 0) return true;
    // Keep unknowns for unverified criteria only
    return true;
  });

  // Remove unknowns for criteria we scored
  const filteredUnknowns = cleanedUnknowns.filter((u) => {
    if (scoredLabels.has('Explicit going-concern / substantial-doubt language in latest 10-Q/10-K') &&
      u.includes('Going-concern')) return false;
    if (reasons.some((r) => r.label.includes('Cash runway')) && u.includes('Cash runway')) return false;
    if (reasons.some((r) => r.label.includes('working capital')) && u.includes('Working capital')) return false;
    if (reasons.some((r) => r.label.includes('ATM') || r.label.includes('equity line')) && u.includes('ATM')) return false;
    if (reasons.some((r) => r.label.includes('shelf')) && u.includes('shelf')) return false;
    if (reasons.some((r) => r.label.includes('Registered direct')) && u.includes('Registered direct')) return false;
    if (reasons.some((r) => r.label.includes('Private placement')) && u.includes('Private placement')) return false;
    if (reasons.some((r) => r.label.includes('Convertible')) && u.includes('Convertible debt not verified')) return false;
    if (reasons.some((r) => r.label.includes('Debt-for-equity')) && u.includes('Debt-for-equity')) return false;
    if (reasons.some((r) => r.label.includes('Reverse split')) && u.includes('Reverse split')) return false;
    if (reasons.some((r) => r.label.includes('Nasdaq deficiency')) && u.includes('Nasdaq deficiency')) return false;
    return true;
  });

  const capacity = buildCapacity(events);
  const recentIssuance = buildRecentIssuance(events, asOf);
  // If we successfully scanned but found no issuance, mark as reported zero windows only when we have capacity events scanned;
  // plan: unknown must never render as "None" — use unknown when no issuance evidence.
  // When shelf-only, recent issuance stays unknown (not zero).

  const sharesOutstanding = buildSharesOutstanding(fundamentals);

  const latestVerifiedAt = events
    .map((e) => e.verifiedAt || e.filedAt || e.eventDate)
    .filter(Boolean)
    .sort()
    .at(-1);

  // Suppress unused placeholder helper lint in case
  void placeholderEvidence;

  return {
    available: true,
    score,
    status,
    dilutionLikelihood,
    shortExecutionRisk: exec.score,
    summary: summaryForStatus(status),
    reasons,
    unknowns: filteredUnknowns,
    capacity,
    recentIssuance,
    sharesOutstanding,
    events,
    scannedThrough: scannedThrough || asOf,
    windowStart,
    windowEnd,
    latestVerifiedAt,
    criteriaTotal: 10,
    criteriaVerified: reasons.length,
  };
}

export { unavailableCapitalPressure };
