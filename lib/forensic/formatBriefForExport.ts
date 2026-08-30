// lib/forensic/formatBriefForExport.ts
//
// Plain-text sections for forensic brief copy/export. Fact pack is the
// deterministic source; thesis is optional LLM synthesis layered on top.

import { formatTaggedClaimPlain, parseInlineClaimTag } from '@/lib/claims';
import type { AiThesisResult } from '@/lib/ai/types';
import type { ForensicFactPack } from './types';

export type BriefSectionKind =
  | 'scorecard'
  | 'snapshot'
  | 'alerts'
  | 'conflicts'
  | 'prose'
  | 'bullets'
  | 'catalysts'
  | 'forward-dates';

export interface BriefSection {
  title: string;
  lines: string[];
  kind?: BriefSectionKind;
}

/** Format inline VERIFY:/CONFLICT:/OPINION: prose for PDF/plain export. */
export function formatProseForExport(text: string): string {
  const { tag, body } = parseInlineClaimTag(text);
  if (tag === 'verified') return body;
  return `[${tag.toUpperCase()}] ${body}`;
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtShares(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function buildBriefSections(
  factPack: ForensicFactPack,
  thesis?: AiThesisResult | null
): BriefSection[] {
  const sections: BriefSection[] = [];
  const s = factPack.snapshot;

  if (factPack.quickScorecard) {
    const q = factPack.quickScorecard;
    const fmt = (v: number | null) => (v != null ? `${v}/10` : 'UNKNOWN');
    sections.push({
      title: '0. Quick Scorecard',
      kind: 'scorecard',
      lines: [
        `Combined Runner Risk: ${fmt(q.combined.value)}`,
        `Offering / Dilution: ${fmt(q.offering.value)}`,
        `Cash Need: ${fmt(q.cashNeed.value)}`,
        `Delisting: ${fmt(q.delisting.value)}`,
        `Survival-Pump: ${fmt(q.survivalPump.value)}`,
        `Squeeze / Low-Float: ${fmt(q.squeeze.value)}`,
        ...(q.offeringTrap ? [`OFFERING TRAP: ${q.offeringTrapSummary ?? 'yes'}`] : []),
      ],
    });
  }

  const snapshotLines: string[] = [];
  if (s.price != null) snapshotLines.push(`Price: $${s.price}`);
  if (s.marketCap != null) snapshotLines.push(`Market cap: ${fmtMoney(s.marketCap)}`);
  if (s.floatShares != null) snapshotLines.push(`Float: ${fmtShares(s.floatShares)} shares`);
  if (s.sharesOutstanding != null) {
    snapshotLines.push(`Shares outstanding: ${fmtShares(s.sharesOutstanding)}`);
  }
  if (s.institutionalOwnership != null) {
    snapshotLines.push(`Institutional ownership: ${fmtPct(s.institutionalOwnership)}`);
  }
  if (s.shortFloat != null) snapshotLines.push(`Short float: ${fmtPct(s.shortFloat)}`);
  if (s.droppinessScore != null) snapshotLines.push(`Droppiness score: ${s.droppinessScore}`);
  if (s.capitalPressureScore != null) {
    snapshotLines.push(
      `Capital Pressure: ${s.capitalPressureScore}/100 (${s.capitalPressureStatus ?? 'n/a'})`
    );
  }
  if (s.fastVerdict) snapshotLines.push(`Fast Verdict: ${s.fastVerdict}`);
  if (s.shortCheckRating != null) {
    snapshotLines.push(
      `Short Check: ${s.shortCheckRating.toFixed(1)}% (${s.shortCheckCategory ?? 'n/a'})`
    );
  }
  if (snapshotLines.length) {
    sections.push({ title: '1. Snapshot', lines: snapshotLines, kind: 'snapshot' });
  }

  if (factPack.alerts.length) {
    sections.push({
      title: '2. Alerts (binding / high-signal)',
      lines: factPack.alerts.map((a) => formatTaggedClaimPlain(a)),
      kind: 'alerts',
    });
  }

  if (factPack.conflicts.length) {
    sections.push({
      title: '3. Conflicts (EDGAR/scan governs)',
      lines: factPack.conflicts.map((c) => formatTaggedClaimPlain(c)),
      kind: 'conflicts',
    });
  }

  if (factPack.rubric.length) {
    sections.push({
      title: '4. Rubric',
      lines: factPack.rubric.map((r) => `${r.label}: ${r.value}`),
      kind: 'bullets',
    });
  }

  if (factPack.notes.length) {
    sections.push({
      title: '5. SEC evidence notes',
      lines: factPack.notes,
      kind: 'bullets',
    });
  }

  if (!thesis) {
    if (factPack.dataGaps.length) {
      sections.push({
        title: '6. Data gaps',
        lines: factPack.dataGaps.map((g) => formatTaggedClaimPlain(g)),
        kind: 'bullets',
      });
    }
    return sections;
  }

  if (thesis.regulatoryAlert?.trim()) {
    sections.push({
      title: '6. Regulatory alert',
      lines: [formatProseForExport(thesis.regulatoryAlert)],
      kind: 'alerts',
    });
  }

  sections.push({
    title: '7. Summary',
    lines: [formatProseForExport(thesis.summary)],
    kind: 'prose',
  });

  sections.push({
    title: '8. Thesis',
    lines: thesis.thesis.split(/\n\n+/).map(formatProseForExport).filter(Boolean),
    kind: 'prose',
  });

  if (thesis.rubricNarrative?.trim()) {
    sections.push({
      title: '9. Rubric narrative',
      lines: [formatProseForExport(thesis.rubricNarrative)],
      kind: 'prose',
    });
  }

  if (thesis.ceoLens?.trim()) {
    sections.push({
      title: '10. CEO lens (issuer constraints)',
      lines: [formatProseForExport(thesis.ceoLens)],
      kind: 'prose',
    });
  }

  if (thesis.traderLens?.trim()) {
    sections.push({
      title: '11. Trader lens (setup mechanics)',
      lines: [formatProseForExport(thesis.traderLens)],
      kind: 'prose',
    });
  }

  if (thesis.catalysts.length) {
    sections.push({
      title: '12. Catalysts',
      lines: thesis.catalysts.map(
        (c) =>
          `[${c.significance.toUpperCase()}] ${c.description}${c.date ? ` (${c.date})` : ''} - ${c.rationale}`
      ),
      kind: 'catalysts',
    });
  }

  if (thesis.forwardDates?.length) {
    sections.push({
      title: '13. Forward dates (radar)',
      lines: thesis.forwardDates.map(
        (f) =>
          `${f.date}: ${f.event} [${f.significance}]${f.tag ? ` (${f.tag.toUpperCase()})` : ''}`
      ),
      kind: 'forward-dates',
    });
  }

  const gapLines = [
    ...factPack.dataGaps.map((g) => formatTaggedClaimPlain(g)),
    ...(thesis.dataGaps ?? []).map(formatProseForExport),
  ];
  if (gapLines.length) {
    sections.push({ title: '14. Data gaps', lines: gapLines, kind: 'bullets' });
  }

  if (thesis.keyRisks.length) {
    sections.push({
      title: '15. What could invalidate this',
      lines: thesis.keyRisks.map(formatProseForExport),
      kind: 'bullets',
    });
  }

  return sections;
}

export function formatBriefPlainText(
  factPack: ForensicFactPack,
  thesis?: AiThesisResult | null
): string {
  const lines: string[] = [
    `FORENSIC BRIEF — ${factPack.ticker}`,
    `As of: ${factPack.asOf}`,
    `Fact pack: ${factPack.version}`,
  ];

  if (thesis?.reportVersion) lines.push(`Report: ${thesis.reportVersion}`);
  if (thesis?.generatedAt) lines.push(`Generated: ${thesis.generatedAt}`);
  if (thesis?.model) lines.push(`Model: Groq (${thesis.model})`);
  lines.push('');

  for (const section of buildBriefSections(factPack, thesis)) {
    lines.push(section.title);
    lines.push('─'.repeat(Math.min(section.title.length, 40)));
    for (const line of section.lines) {
      lines.push(line);
    }
    lines.push('');
  }

  lines.push(
    'DISCLAIMER: Research synthesis only — not trade authorization. Framework 3.0 walk-away flags bind.'
  );
  return lines.join('\n');
}
