import type { TaggedClaim } from '@/lib/claims';
import type { ThesisPromptInput } from '@/lib/ai/types';
import { buildQuickScorecard, formatQuickScorecardForPrompt } from './quickScorecard/buildQuickScorecard';
import { toQuickScorecardInputFromThesis } from './quickScorecard';
import type { ForensicFactPack, ForensicRubricRow, ForensicSnapshot } from './types';
import { FORENSIC_FACT_PACK_VERSION } from './types';

function verified(text: string, sources?: TaggedClaim['sources']): TaggedClaim {
  return { text, tag: 'verified', sources };
}

function verify(text: string): TaggedClaim {
  return { text, tag: 'verify' };
}

function conflict(text: string, conflictNote: string): TaggedClaim {
  return { text, tag: 'conflict', conflictNote };
}

function rubricFromDt(
  extracted: NonNullable<ThesisPromptInput['extractedData']>
): ForensicRubricRow[] {
  const rows: ForensicRubricRow[] = [];
  const push = (label: string, raw?: string) => {
    if (!raw) return;
    const cleaned = raw.replace(/^DT:/i, '').trim();
    rows.push({ label, value: cleaned || raw, tag: 'verified' });
  };
  push('Offering Ability', extracted.atmShelfStatus);
  return rows;
}

function buildRubric(input: ThesisPromptInput): ForensicRubricRow[] {
  const rows: ForensicRubricRow[] = [];
  if (input.extractedData) {
    rows.push(...rubricFromDt(input.extractedData));
  }
  if (input.shortCheck?.actualValues) {
    for (const [key, value] of Object.entries(input.shortCheck.actualValues)) {
      if (value) rows.push({ label: key, value, tag: 'verified' });
    }
  }
  return rows;
}

function detectFloatConflict(input: ThesisPromptInput): TaggedClaim | null {
  const dtFloat = input.extractedData?.float;
  const scanFloat = input.scan?.fundamentals?.floatShares;
  if (dtFloat == null || scanFloat == null) return null;
  const a = Number(dtFloat);
  const b = Number(scanFloat);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const ratio = Math.max(a, b) / Math.min(a, b);
  if (ratio < 1.15) return null;
  return conflict(
    `Float: DilutionTracker ${a.toLocaleString()} vs scan ${b.toLocaleString()} shares`,
    'EDGAR/scan API governs over DT OCR for synthesis'
  );
}

export function buildForensicFactPack(input: ThesisPromptInput): ForensicFactPack {
  const asOf = input.now ?? new Date().toISOString();
  const alerts: TaggedClaim[] = [];
  const dataGaps: TaggedClaim[] = [];
  const notes: string[] = [];

  if (input.fastVerdict?.flags?.length) {
    for (const flag of input.fastVerdict.flags) {
      alerts.push(verified(flag, [{ kind: 'fast_verdict', label: 'walk-away' }]));
    }
  }
  if (input.shortCheck?.walkAwayFlags?.length) {
    for (const flag of input.shortCheck.walkAwayFlags) {
      alerts.push(verified(flag, [{ kind: 'short_check', label: 'walk-away' }]));
    }
  }
  if (input.fastVerdict?.borrowAvailable === false) {
    alerts.push(
      verified('Borrow unavailable — short execution may be blocked', [
        { kind: 'fast_verdict', label: 'borrow' },
      ])
    );
  }
  const cp = input.scan?.capitalPressure;
  if (cp && (cp.status === 'high' || cp.status === 'elevated')) {
    alerts.push(
      verified(`Capital Pressure ${cp.score}/100 (${cp.status}) — ${cp.summary}`, [
        { kind: 'edgar', label: 'capital_pressure' },
      ])
    );
  }

  const floatConflict = detectFloatConflict(input);
  const conflicts: TaggedClaim[] = floatConflict ? [floatConflict] : [];

  if (input.scan?.insiderTransactionsCount != null && input.scan.insiderTransactionsCount > 0) {
    dataGaps.push(
      verify(
        `Insider activity: ${input.scan.insiderTransactionsCount} Form 4 filings in 12mo — buy/sell direction not parsed`
      )
    );
  }
  if (input.fastVerdict && input.fastVerdict.dataCompleteness < 0.7) {
    dataGaps.push(
      verify(
        `Fast Verdict data completeness ${Math.round(input.fastVerdict.dataCompleteness * 100)}% — missing market sources`
      )
    );
  }
  if (input.shortCheck?.dataCompleteness != null && input.shortCheck.dataCompleteness < 0.7) {
    dataGaps.push(
      verify(
        `Short Check data completeness ${Math.round(input.shortCheck.dataCompleteness * 100)}% — DT fields incomplete`
      )
    );
  }
  if (!cp?.events?.length && !cp?.reasons?.length) {
    if (input.scan && !cp) {
      dataGaps.push(verify('Capital Pressure module unavailable for this scan'));
    }
  }

  const snapshot: ForensicSnapshot = {
    price: input.extractedData?.currentPrice ?? input.scan?.fundamentals?.price,
    marketCap: input.scan?.fundamentals?.marketCap,
    floatShares: input.scan?.fundamentals?.floatShares,
    sharesOutstanding: input.scan?.fundamentals?.sharesOutstanding,
    institutionalOwnership: input.scan?.fundamentals?.institutionalOwnership,
    shortFloat: input.scan?.fundamentals?.shortFloat,
    droppinessScore: input.scan?.droppinessScore,
    capitalPressureScore: cp?.score,
    capitalPressureStatus: cp?.status,
    fastVerdict: input.fastVerdict?.verdict,
    shortCheckRating: input.shortCheck?.rating,
    shortCheckCategory: input.shortCheck?.category,
  };

  if (cp?.reasons?.length) {
    for (const reason of cp.reasons.slice(0, 3)) {
      const src = reason.evidence?.accessionNumber
        ? [{ kind: 'edgar' as const, accessionNumber: reason.evidence.accessionNumber, label: reason.evidence.form }]
        : undefined;
      notes.push(formatTaggedForPrompt(verified(`${reason.label} (${reason.points > 0 ? '+' : ''}${reason.points})`, src)));
    }
  }

  return {
    version: FORENSIC_FACT_PACK_VERSION,
    ticker: input.ticker.toUpperCase(),
    asOf,
    alerts,
    conflicts,
    snapshot,
    rubric: buildRubric(input),
    dataGaps,
    notes,
    quickScorecard: buildQuickScorecard(
      toQuickScorecardInputFromThesis(input, input.shortCheck?.cashNeedPoints)
    ),
  };
}

function formatTaggedForPrompt(claim: TaggedClaim): string {
  const tag = claim.tag ?? 'verified';
  if (tag === 'verified') {
    return claim.conflictNote ? `${claim.text} [CONFLICT: ${claim.conflictNote}]` : claim.text;
  }
  return `[${tag.toUpperCase()}] ${claim.text}`;
}

export function formatFactPackForPrompt(pack: ForensicFactPack): string {
  const lines: string[] = [];
  lines.push(`packVersion: ${pack.version}`);
  lines.push(`asOf: ${pack.asOf}`);

  if (pack.quickScorecard) {
    lines.push('\n' + formatQuickScorecardForPrompt(pack.quickScorecard));
  }

  if (pack.alerts.length) {
    lines.push('\nAlerts (binding / high-signal):');
    for (const a of pack.alerts) lines.push(`  - ${formatTaggedForPrompt(a)}`);
  }
  if (pack.conflicts.length) {
    lines.push('\nConflicts (EDGAR/scan governs):');
    for (const c of pack.conflicts) lines.push(`  - ${formatTaggedForPrompt(c)}`);
  }
  if (pack.dataGaps.length) {
    lines.push('\nData gaps (must surface as VERIFY in output — do not invent):');
    for (const g of pack.dataGaps) lines.push(`  - ${formatTaggedForPrompt(g)}`);
  }

  lines.push('\nSnapshot:');
  const s = pack.snapshot;
  if (s.price != null) lines.push(`  price: $${s.price}`);
  if (s.marketCap != null) lines.push(`  marketCap: $${(s.marketCap / 1e6).toFixed(2)}M`);
  if (s.floatShares != null) lines.push(`  floatShares: ${s.floatShares.toLocaleString()}`);
  if (s.droppinessScore != null) lines.push(`  droppinessScore: ${s.droppinessScore}`);
  if (s.capitalPressureScore != null) {
    lines.push(`  capitalPressure: ${s.capitalPressureScore}/100 (${s.capitalPressureStatus})`);
  }
  if (s.fastVerdict) lines.push(`  fastVerdict: ${s.fastVerdict}`);
  if (s.shortCheckRating != null) {
    lines.push(`  shortCheckRating: ${s.shortCheckRating.toFixed(1)}% (${s.shortCheckCategory})`);
  }

  if (pack.rubric.length) {
    lines.push('\nRubric (DT / score components):');
    for (const row of pack.rubric) {
      lines.push(`  - ${row.label}: ${row.value}`);
    }
  }
  if (pack.notes.length) {
    lines.push('\nSEC evidence notes:');
    for (const n of pack.notes) lines.push(`  - ${n}`);
  }

  return lines.join('\n');
}
