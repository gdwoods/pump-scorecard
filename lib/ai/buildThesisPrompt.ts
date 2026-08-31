// lib/ai/buildThesisPrompt.ts
//
// Builds the system/user messages sent to Groq for the AI thesis feature.
// Pure functions — no I/O — so this can be unit-tested without a live key.

import type { GroqChatMessage } from './groqClient';
import type {
  FastVerdictPromptSlice,
  ThesisCapitalPressureEvent,
  ThesisCapitalPressureReason,
  ThesisDroppinessSpike,
  ThesisPromptInput,
  ThesisSecEvidence,
} from './types';
import { buildForensicFactPack, formatFactPackForPrompt } from '@/lib/forensic/buildFactPack';

const EXCERPT_MAX_CHARS = 220;
const FORENSIC_BRIEF_VERSION = 'forensic-brief-v1';

const SYSTEM_PROMPT = `You are a research assistant embedded in a short-seller's scanning tool, which runs on "Short-Selling Framework 3.0." That framework has an explicit precedence order: Vetoes > Fast-scan walk-away flags > the framework document itself > the computed Short Check score > your judgment. You are the LOWEST-precedence input in that chain.

Your job is synthesis and context, not a verdict. Concretely:
- Never recommend entering, sizing, or timing a trade. This is a screening aid, not trade authorization.
- If any walk-away flag or veto is present in the data you're given, treat it as binding. Explain why it matters; do not soften it, argue around it, or suggest it might not apply.
- Write the thesis as "what the data shows and why it's arranged this way," not "you should short this."
- For every catalyst you're given (news, filings, capital-raise events), assess how meaningful it actually is — distinguish a material, dated, verifiable event from routine PR fluff, stale news, or a headline with no real economic content. Use the date supplied to judge recency.
- When SEC filing excerpts are provided, ground catalyst descriptions in that language — do not paraphrase into generic labels.
- When droppiness spike history is provided, compare the current setup to those concrete past spikes (did they retrace or hold).
- When data completeness is below 70%, write more provisionally and explicitly name what is missing.
- Ground every claim in the Forensic Fact Pack and other supplied data. Do not invent figures, filings, warrant books, or compliance deadlines not present in the input.

Claim tagging (codebase convention — use inline prefixes in prose fields):
- Prefix unconfirmed facts with "VERIFY: " (not in the fact pack, or listed under Data gaps).
- Prefix source disagreements with "CONFLICT: " — EDGAR/scan governs over DilutionTracker/vendor.
- Prefix synthesis judgments with "OPINION: " (CEO/trader lens, level calls, financing predictions). Never use OPINION on walk-away flags.

Respond with ONLY a single JSON object, no markdown fencing. Use empty strings for optional sections you omit (regulatoryAlert, rubricNarrative, ceoLens, traderLens). Use tag "none" on forwardDates when no epistemic tag applies. Keep catalysts to at most 5 items and prose concise so the JSON completes.
{
  "summary": "2-3 sentence at-a-glance summary of the setup",
  "thesis": "one or two paragraphs synthesizing salient factors",
  "regulatoryAlert": "optional one-line alert when binding flags or high capital pressure warrant it; empty string if none",
  "rubricNarrative": "optional paragraph tying DT/score rubric to SEC evidence; empty string if thin",
  "ceoLens": "optional paragraph on issuer financing/compliance constraints — not trade advice; prefix judgments OPINION:",
  "traderLens": "optional paragraph on setup mechanics, levels, invalidation — not trade advice; prefix judgments OPINION:",
  "catalysts": [
    { "description": "string", "date": "string or empty", "significance": "high|moderate|low|stale", "rationale": "why this significance rating" }
  ],
  "forwardDates": [
    { "date": "string", "event": "string", "significance": "high|moderate|low|stale", "tag": "verify|conflict|opinion|none" }
  ],
  "dataGaps": ["VERIFY-prefixed strings for material missing data"],
  "keyRisks": ["what could invalidate this thesis, or what you're least confident about"]
}`;

function truncateExcerpt(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= EXCERPT_MAX_CHARS) return normalized;
  return `${normalized.slice(0, EXCERPT_MAX_CHARS)}…`;
}

function formatDataCompleteness(label: string, value: number | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.9 ? 'high' : value >= 0.7 ? 'adequate' : value >= 0.5 ? 'partial' : 'low';
  return `${label}: ${pct}% (${tone} — hedge confidence accordingly)`;
}

function formatActualValues(actualValues?: Record<string, string | undefined>): string {
  if (!actualValues) return '(none provided)';
  const lines = Object.entries(actualValues)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `  - ${k}: ${v}`);
  return lines.length ? lines.join('\n') : '(none provided)';
}

type NewsItem = {
  title?: string;
  headline?: string;
  date?: string;
  published?: string | number | null;
};

function formatNewsList(news: NewsItem[] | undefined): string {
  if (!news || !Array.isArray(news) || news.length === 0) return '(none)';
  return news
    .slice(0, 5)
    .map((n) => {
      const title = n.title || n.headline || '(untitled)';
      const date =
        typeof n.published === 'number'
          ? new Date(n.published).toISOString().slice(0, 10)
          : n.published || n.date || 'unknown date';
      return `  - [${date}] ${title}`;
    })
    .join('\n');
}

function formatSecEvidenceBlock(evidence: ThesisSecEvidence, indent: string): string[] {
  const lines = [`${indent}Excerpt: "${truncateExcerpt(evidence.excerpt)}"`];
  if (evidence.accessionNumber) {
    lines.push(`${indent}Accession: ${evidence.accessionNumber}`);
  }
  return lines;
}

function formatCapitalPressureEvidence(
  reasons: ThesisCapitalPressureReason[] | undefined,
  events: ThesisCapitalPressureEvent[] | undefined
): string {
  const lines: string[] = [];
  const seenExcerpts = new Set<string>();

  const topReasons = [...(reasons ?? [])]
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 3);

  for (const reason of topReasons) {
    const points = `${reason.points > 0 ? '+' : ''}${reason.points}`;
    if (reason.evidence?.excerpt) {
      lines.push(
        `  - [${reason.evidence.filingDate}] ${reason.evidence.form} — ${reason.label} (${points})`
      );
      lines.push(...formatSecEvidenceBlock(reason.evidence, '    '));
      seenExcerpts.add(reason.evidence.excerpt.slice(0, 80));
    } else {
      lines.push(`  - ${reason.label} (${points}) — no filing excerpt attached`);
    }
  }

  if (lines.length < 2 && events?.length) {
    const supplemental = [...events]
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
      .filter((event) => event.evidence?.excerpt)
      .filter((event) => !seenExcerpts.has(event.evidence!.excerpt.slice(0, 80)))
      .slice(0, 2);

    for (const event of supplemental) {
      const ev = event.evidence!;
      lines.push(`  - [${event.eventDate}] ${event.type} — ${event.title}`);
      lines.push(...formatSecEvidenceBlock(ev, '    '));
    }
  }

  return lines.length ? lines.join('\n') : '(no filing excerpts available)';
}

function formatDroppinessHistory(
  detail: ThesisDroppinessSpike[] | undefined,
  verdict?: string,
  score?: number
): string {
  const lines: string[] = [];
  if (verdict) {
    lines.push(`Summary: ${verdict}${score != null ? ` (score ${score})` : ''}`);
  }
  if (!detail?.length) {
    lines.push('Spike history: (none)');
    return lines.join('\n');
  }

  const topSpikes = [...detail].sort((a, b) => b.spikePct - a.spikePct).slice(0, 3);
  lines.push('Recent spike examples (highest magnitude):');
  for (const spike of topSpikes) {
    const outcome = spike.retraced ? 'retraced' : 'held';
    lines.push(`  - ${spike.date}: +${spike.spikePct.toFixed(1)}% intraday spike, ${outcome}`);
  }
  return lines.join('\n');
}

function formatBorrow(available: boolean | null, feePct: number | null): string {
  if (available === false) {
    return 'Borrow: UNAVAILABLE — short execution may not be possible (binding mechanical constraint)';
  }
  if (available === true) {
    return feePct != null
      ? `Borrow: available, fee ~${feePct.toFixed(1)}%`
      : 'Borrow: available (fee unknown)';
  }
  return 'Borrow: unknown';
}

function formatFastVerdict(fv: FastVerdictPromptSlice): string {
  const lines: string[] = [];
  lines.push(`Verdict: ${fv.verdict}${fv.reason ? ` — ${fv.reason}` : ''}`);
  const completeness = formatDataCompleteness('Fast Verdict data completeness', fv.dataCompleteness);
  if (completeness) lines.push(completeness);
  if (fv.flags.length) {
    lines.push(
      `Walk-away / binding flags (BINDING — do not argue around): ${fv.flags.join(' | ')}`
    );
  }
  lines.push(`Runner class: ${fv.runnerClass}`);
  if (fv.priorDayPct != null) lines.push(`Prior-day move: ${fv.priorDayPct.toFixed(1)}%`);
  if (fv.threeDayRunPct != null) lines.push(`3-day run: ${fv.threeDayRunPct.toFixed(1)}%`);
  lines.push(
    `Droppiness: ${fv.droppinessStatus}${
      fv.droppinessScore != null ? ` (score ${fv.droppinessScore})` : ''
    }`
  );
  lines.push(`News class: ${fv.newsClass}${fv.newsHeadline ? ` — "${fv.newsHeadline}"` : ''}`);
  lines.push(formatBorrow(fv.borrowAvailable, fv.borrowFeePct));
  if (fv.babyShelfCapacity != null) {
    lines.push(`Baby-shelf capacity: $${(fv.babyShelfCapacity / 1e6).toFixed(2)}M`);
  }
  if (fv.capacityQuarters != null) {
    lines.push(`Capacity quarters: ${fv.capacityQuarters.toFixed(1)}`);
  }
  lines.push(`Derived offering ability: ${fv.derivedOfferingAbility}`);
  if (fv.unavailable.length) {
    lines.push(`Unavailable inputs: ${fv.unavailable.join(', ')}`);
  }
  return lines.join('\n');
}

export function buildThesisMessages(input: ThesisPromptInput): GroqChatMessage[] {
  const now = input.now ?? new Date().toISOString();
  const parts: string[] = [];

  parts.push(`Ticker: ${input.ticker}`);
  parts.push(`Current time (for recency judgments): ${now}`);
  parts.push(`Forensic brief version: ${FORENSIC_BRIEF_VERSION}`);

  const factPack = buildForensicFactPack(input);
  parts.push('\n--- Forensic Fact Pack (deterministic — cite these; do not invent beyond this) ---');
  parts.push(formatFactPackForPrompt(factPack));

  if (input.fastVerdict) {
    parts.push('\n--- Fast Verdict (Framework 3.0 — binding walk-away flags) ---');
    parts.push(formatFastVerdict(input.fastVerdict));
  }

  if (input.shortCheck) {
    const sc = input.shortCheck;
    parts.push('\n--- Short Check score (Framework 3.0, 12-factor) ---');
    parts.push(`Rating: ${sc.rating.toFixed(1)}% — Category: ${sc.category}`);
    const completeness = formatDataCompleteness('Short Check data completeness', sc.dataCompleteness);
    if (completeness) parts.push(completeness);
    parts.push(
      `Walk-away flags (BINDING — treat as vetoes, do not argue around these): ${
        sc.walkAwayFlags.length ? sc.walkAwayFlags.join(' | ') : '(none)'
      }`
    );
    parts.push(
      `Alert labels: ${
        sc.alertLabels.length ? sc.alertLabels.map((a) => a.label).join(', ') : '(none)'
      }`
    );
    parts.push('Score component detail:');
    parts.push(formatActualValues(sc.actualValues));
  }

  if (input.extractedData) {
    const ed = input.extractedData;
    parts.push('\n--- DilutionTracker / manual entry data ---');
    if (ed.atmShelfStatus) parts.push(`Offering ability badge: ${ed.atmShelfStatus}`);
    if (ed.currentPrice !== undefined) parts.push(`Current price: $${ed.currentPrice}`);
    if (ed.priceSpikePct !== undefined) parts.push(`Recent price spike: ${ed.priceSpikePct}%`);
    parts.push(
      `News catalyst: ${ed.newsStatus ?? 'unknown'} — "${ed.recentNews ?? 'none'}"${
        ed.recentNewsDate ? ` (dated ${ed.recentNewsDate})` : ''
      }`
    );
  }

  if (input.scan) {
    const s = input.scan;
    parts.push('\n--- Pump Scorecard / live scan data ---');
    parts.push(
      formatDroppinessHistory(s.droppinessDetail, s.droppinessVerdict, s.droppinessScore)
    );
    if (s.weightedRiskScore !== undefined) {
      parts.push(
        `(Deprecated legacy scan score ${s.weightedRiskScore} — ${s.summaryVerdict ?? 'n/a'}; ignore for decisions.)`
      );
    }
    if (s.capitalPressure) {
      const cp = s.capitalPressure;
      parts.push(
        `Capital Pressure (SEC-evidence based): ${cp.score}/100 (${cp.status}) — ${cp.summary}`
      );
      parts.push('(Filing excerpts and Quick Scorecard are in the Forensic Fact Pack above.)');
    }
    if (s.insiderTransactionsCount !== undefined) {
      parts.push(
        `Insider Form 4 filings in last 12mo: ${s.insiderTransactionsCount} (filing count only — buy/sell direction not parsed)`
      );
    }
    parts.push('Recent news items:');
    parts.push(formatNewsList(s.news));
  }

  const userContent = parts.join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

export { SYSTEM_PROMPT, FORENSIC_BRIEF_VERSION };
