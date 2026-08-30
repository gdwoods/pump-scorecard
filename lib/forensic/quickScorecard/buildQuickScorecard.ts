// lib/forensic/quickScorecard/buildQuickScorecard.ts

import { T } from '@/lib/config/thresholds';
import type {
  QuickScorecard,
  QuickScorecardInput,
  QuickScoreKey,
  QuickScoreMetric,
  ScoreConfidence,
} from './types';

const MS_DAY = 24 * 60 * 60 * 1000;

function clamp10(n: number): number {
  return Math.max(0, Math.min(10, Math.round(n)));
}

function bandFor(value: number | null): QuickScoreMetric['band'] {
  if (value == null) return 'unknown';
  if (value <= 2) return 'low';
  if (value <= 5) return 'moderate';
  if (value <= 7) return 'elevated';
  if (value <= 9) return 'high';
  return 'extreme';
}

function metric(
  key: QuickScoreKey,
  label: string,
  value: number | null,
  confidence: ScoreConfidence,
  summary: string
): QuickScoreMetric {
  return { key, label, value, band: bandFor(value), confidence, summary };
}

function scoreOffering(input: QuickScorecardInput): QuickScoreMetric {
  const cp = input.capitalPressure;
  if (cp?.available === false) {
    return metric('offering', 'Offering / Dilution', null, 'unknown', 'Capital Pressure unavailable.');
  }
  if (cp?.dilutionLikelihood != null) {
    return metric(
      'offering',
      'Offering / Dilution',
      clamp10(cp.dilutionLikelihood),
      'verified',
      `Capital Pressure dilution likelihood (${cp.status ?? 'n/a'}).`
    );
  }
  if (cp?.score != null) {
    return metric(
      'offering',
      'Offering / Dilution',
      clamp10(cp.score / 10),
      'verified',
      `Mapped from Capital Pressure score ${cp.score}/100.`
    );
  }
  const ability = input.fastVerdict?.derivedOfferingAbility;
  if (ability === 'HIGH') {
    return metric('offering', 'Offering / Dilution', 7, 'estimated', 'Fast Verdict offering ability HIGH.');
  }
  if (ability === 'MEDIUM') {
    return metric('offering', 'Offering / Dilution', 5, 'estimated', 'Fast Verdict offering ability MEDIUM.');
  }
  if (ability === 'LOW') {
    return metric('offering', 'Offering / Dilution', 2, 'estimated', 'Fast Verdict offering ability LOW.');
  }
  return metric('offering', 'Offering / Dilution', null, 'unknown', 'No CP or offering-ability signal.');
}

function scoreCashNeed(input: QuickScorecardInput): QuickScoreMetric {
  const runway = input.fundamentals?.runwayMonths;
  if (runway != null && Number.isFinite(runway)) {
    let v = 2;
    if (runway < 3) v = 10;
    else if (runway < 6) v = 8;
    else if (runway < 12) v = 6;
    else if (runway < 24) v = 4;
    return metric(
      'cashNeed',
      'Cash Need',
      v,
      'estimated',
      `Runway ~${runway.toFixed(1)} months (market/scan estimate).`
    );
  }
  const pts = input.shortCheck?.cashNeedPoints;
  if (pts != null) {
    const v = pts >= 25 ? 10 : pts >= 18 ? 7 : pts >= 10 ? 5 : 2;
    return metric('cashNeed', 'Cash Need', v, 'verified', `Short Check cash-need component ${pts}/25.`);
  }
  const quarters = input.fastVerdict?.capacityQuarters;
  if (quarters != null && quarters < T.babyShelf.criticalQuarters) {
    return metric(
      'cashNeed',
      'Cash Need',
      9,
      'estimated',
      `Baby-shelf capacity ~${quarters.toFixed(1)} quarters — severe liquidity pressure.`
    );
  }
  return metric('cashNeed', 'Cash Need', null, 'unknown', 'Runway / cash balance not verified.');
}

function daysAgo(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / MS_DAY);
}

function scoreDelisting(input: QuickScorecardInput, now: Date): QuickScoreMetric {
  const cp = input.capitalPressure;
  const events = cp?.events ?? [];
  let value = 0;
  const notes: string[] = [];

  const deficiency = events.filter((e) => e.type === 'nasdaq_deficiency');
  const compliance = events.filter((e) => e.type === 'nasdaq_compliance');
  const splits = events.filter((e) => e.type === 'reverse_split' && !e.isRetrospective);

  if (deficiency.length) {
    value += 7;
    notes.push(`${deficiency.length} Nasdaq deficiency notice(s) in CP window`);
  }
  if (splits.length) {
    const recent = splits.some((e) => e.eventDate && daysAgo(e.eventDate, now) <= 365);
    value += recent ? 2 : 1;
    notes.push(`${splits.length} reverse split event(s)`);
  }
  if (cp?.upcomingReverseSplit) {
    value += 1;
    notes.push('Upcoming reverse split detected');
  }
  if (compliance.length && !deficiency.length) {
    value = Math.max(0, value - 2);
    notes.push('Recent compliance regained — reduced delisting pressure');
  }
  if (!notes.length && cp?.available === false) {
    return metric('delisting', 'Delisting', null, 'unknown', 'Capital Pressure unavailable.');
  }
  if (!notes.length) {
    return metric('delisting', 'Delisting', 1, 'estimated', 'No deficiency or split signals in CP window.');
  }
  return metric(
    'delisting',
    'Delisting',
    clamp10(value),
    deficiency.length ? 'verified' : 'estimated',
    notes.join('; ')
  );
}

function scoreSqueeze(input: QuickScorecardInput): QuickScoreMetric {
  const cp = input.capitalPressure;
  if (cp?.shortExecutionRisk != null && cp.available !== false) {
    return metric(
      'squeeze',
      'Squeeze / Low-Float',
      clamp10(cp.shortExecutionRisk),
      'verified',
      'Capital Pressure short-execution risk sub-score.'
    );
  }

  let value = 0;
  const notes: string[] = [];
  const float = input.fundamentals?.float;
  if (float != null && float < T.float.squeezeFloor) {
    value += 4;
    notes.push(`Float ${(float / 1e6).toFixed(2)}M below squeeze floor`);
  } else if (float != null && float < T.float.thin) {
    value += 2;
    notes.push(`Thin float ${(float / 1e6).toFixed(2)}M`);
  }

  const runner = input.fastVerdict?.runnerClass;
  if (runner === 'RUNNER_YESTERDAY' || runner === 'RUNNER_MULTIDAY') {
    value += 3;
    notes.push(`Runner class ${runner}`);
  }

  if (input.fastVerdict?.borrowAvailable === false) {
    value += 1;
    notes.push('Borrow unavailable');
  }

  const si = input.fundamentals?.shortInterest;
  if (si != null && si > 15) {
    value += 1;
    notes.push(`Short interest ~${si.toFixed(0)}%`);
  }

  if (!notes.length) {
    return metric('squeeze', 'Squeeze / Low-Float', null, 'unknown', 'Insufficient float/borrow/runner data.');
  }
  return metric('squeeze', 'Squeeze / Low-Float', clamp10(value), 'estimated', notes.join('; '));
}

function scoreSurvivalPump(
  offering: number | null,
  cash: number | null,
  delisting: number | null,
  squeeze: number | null,
  input: QuickScorecardInput
): QuickScoreMetric {
  const o = offering ?? 0;
  const c = cash ?? 0;
  const d = delisting ?? 0;
  const s = squeeze ?? 0;
  let value = 0;
  const notes: string[] = [];

  if (d >= 6 && c >= 6) {
    value += 4;
    notes.push('Listing pressure + cash need');
  }
  if (d >= 6 && o >= 6) {
    value += 3;
    notes.push('Listing pressure + dilution ability');
  }
  if (c >= 7 && o >= 7) {
    value += 3;
    notes.push('Cash need + offering ability');
  }
  const float = input.fundamentals?.float;
  if (float != null && float < T.float.squeezeFloor && o >= 6) {
    value += 2;
    notes.push('Tiny float + offering ability');
  }
  if (input.capitalPressure?.upcomingReverseSplit) {
    value += 1;
    notes.push('Upcoming reverse split');
  }
  if (d >= 8) value = Math.max(value, 7);

  if (!notes.length) {
    return metric(
      'survivalPump',
      'Survival-Pump',
      clamp10(Math.min(o, d) >= 5 ? 4 : 1),
      'estimated',
      'No acute survival-pump intersection — risk classification only, not manipulation.'
    );
  }

  return metric(
    'survivalPump',
    'Survival-Pump',
    clamp10(value),
    'estimated',
    `${notes.join('; ')}. Incentive/risk classification — not an allegation.`
  );
}

function scoreCombined(
  offering: number | null,
  cash: number | null,
  delisting: number | null,
  survival: number | null,
  squeeze: number | null
): QuickScoreMetric {
  const nums = [offering, delisting, survival, squeeze].filter((n): n is number => n != null);
  if (!nums.length) {
    return metric('combined', 'Combined Runner Risk', null, 'unknown', 'Insufficient inputs for combined score.');
  }

  let combined = Math.max(...nums);
  if (offering != null && cash != null && offering >= 7 && cash >= 7) {
    combined = Math.min(10, combined + 2);
  }
  if (delisting != null && squeeze != null && delisting >= 7 && squeeze >= 7) {
    combined = Math.min(10, combined + 1);
  }
  if (
    offering != null &&
    cash != null &&
    delisting != null &&
    offering >= 8 &&
    cash >= 8 &&
    delisting >= 6
  ) {
    combined = Math.max(combined, 9);
  }

  return metric(
    'combined',
    'Combined Runner Risk',
    clamp10(combined),
    'estimated',
    'Intersection-weighted — not a simple average of sub-scores.'
  );
}

function detectOfferingTrap(
  offering: number | null,
  cash: number | null,
  input: QuickScorecardInput
): { trap: boolean; summary?: string } {
  const cp = input.capitalPressure;
  const shares30 = cp?.recentIssuance?.shares30d ?? 0;
  const activeDraw =
    shares30 > 0 ||
    (cp?.reasons?.some((r) => /atm|eloc|draw|issued/i.test(r.label)) ?? false);
  const atm = input.fastVerdict?.atmDetected === true;

  if ((offering ?? 0) >= 8 && (cash ?? 0) >= 7 && (activeDraw || atm)) {
    return {
      trap: true,
      summary: 'High offering ability + cash need + recent/active financing channel.',
    };
  }
  return { trap: false };
}

export function buildQuickScorecard(input: QuickScorecardInput): QuickScorecard {
  const now = new Date(input.now ?? Date.now());
  const offering = scoreOffering(input);
  const cashNeed = scoreCashNeed(input);
  const delisting = scoreDelisting(input, now);
  const squeeze = scoreSqueeze(input);
  const survivalPump = scoreSurvivalPump(
    offering.value,
    cashNeed.value,
    delisting.value,
    squeeze.value,
    input
  );
  const combined = scoreCombined(
    offering.value,
    cashNeed.value,
    delisting.value,
    survivalPump.value,
    squeeze.value
  );
  const trap = detectOfferingTrap(offering.value, cashNeed.value, input);

  return {
    ticker: input.ticker.toUpperCase(),
    asOf: now.toISOString(),
    combined,
    offering,
    cashNeed,
    delisting,
    survivalPump,
    squeeze,
    offeringTrap: trap.trap,
    offeringTrapSummary: trap.summary,
  };
}

export function formatQuickScorecardForPrompt(card: QuickScorecard): string {
  const fmt = (m: QuickScoreMetric) =>
    m.value != null ? `${m.value}/10 (${m.band}, ${m.confidence})` : `UNKNOWN (${m.confidence})`;
  const lines = [
    'Quick Scorecard (0-10, filing-first derivatives):',
    `  Combined Runner Risk: ${fmt(card.combined)}`,
    `  Offering / Dilution: ${fmt(card.offering)} — ${card.offering.summary}`,
    `  Cash Need: ${fmt(card.cashNeed)} — ${card.cashNeed.summary}`,
    `  Delisting: ${fmt(card.delisting)} — ${card.delisting.summary}`,
    `  Survival-Pump: ${fmt(card.survivalPump)} — ${card.survivalPump.summary}`,
    `  Squeeze / Low-Float: ${fmt(card.squeeze)} — ${card.squeeze.summary}`,
  ];
  if (card.offeringTrap) {
    lines.push(`  OFFERING TRAP: yes — ${card.offeringTrapSummary ?? ''}`);
  }
  return lines.join('\n');
}
