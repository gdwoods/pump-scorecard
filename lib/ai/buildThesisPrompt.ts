// lib/ai/buildThesisPrompt.ts
//
// Builds the system/user messages sent to Groq for the AI thesis feature.
// Pure functions — no I/O — so this can be unit-tested without a live key.

import type { GroqChatMessage } from './groqClient';
import type { FastVerdictPromptSlice, ThesisPromptInput } from './types';

const SYSTEM_PROMPT = `You are a research assistant embedded in a short-seller's scanning tool, which runs on "Short-Selling Framework 3.0." That framework has an explicit precedence order: Vetoes > Fast-scan walk-away flags > the framework document itself > the computed Short Check score > your judgment. You are the LOWEST-precedence input in that chain.

Your job is synthesis and context, not a verdict. Concretely:
- Never recommend entering, sizing, or timing a trade. This is a screening aid, not trade authorization.
- If any walk-away flag or veto is present in the data you're given, treat it as binding. Explain why it matters; do not soften it, argue around it, or suggest it might not apply.
- Write the thesis as "what the data shows and why it's arranged this way," not "you should short this."
- For every catalyst you're given (news, filings, capital-raise events), assess how meaningful it actually is — distinguish a material, dated, verifiable event (a confirmed ATM draw, a going-concern note, a Nasdaq deficiency notice) from routine PR fluff, stale news, or a headline with no real economic content. Use the date supplied to judge recency; a "meaningful" catalyst from four months ago is stale, say so.
- Ground every claim in the specific data supplied. Do not invent figures, filings, or news not present in the input.
- If the input is thin (few real signals), say so plainly rather than padding the thesis.

Respond with ONLY a single JSON object, no markdown fencing, matching exactly this shape:
{
  "summary": "2-3 sentence at-a-glance summary of the setup",
  "thesis": "one or two paragraphs synthesizing the salient factors into a coherent narrative of why this is (or isn't) an attractive short setup",
  "catalysts": [
    { "description": "string", "date": "string or empty", "significance": "high|moderate|low|stale", "rationale": "why this significance rating" }
  ],
  "keyRisks": ["what could invalidate this thesis, or what you're least confident about"]
}`;

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
    .slice(0, 8)
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

function formatFastVerdict(fv: FastVerdictPromptSlice): string {
  const lines: string[] = [];
  lines.push(`Verdict: ${fv.verdict}${fv.reason ? ` — ${fv.reason}` : ''}`);
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

  if (input.fastVerdict) {
    parts.push('\n--- Fast Verdict (Framework 3.0 — binding walk-away flags) ---');
    parts.push(formatFastVerdict(input.fastVerdict));
  }

  if (input.shortCheck) {
    const sc = input.shortCheck;
    parts.push('\n--- Short Check score (Framework 3.0, 12-factor) ---');
    parts.push(`Rating: ${sc.rating.toFixed(1)}% — Category: ${sc.category}`);
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
    if (s.weightedRiskScore !== undefined || s.summaryVerdict) {
      parts.push(`Pump risk score: ${s.weightedRiskScore ?? 'n/a'} — ${s.summaryVerdict ?? 'n/a'}`);
    }
    if (s.droppinessVerdict) parts.push(`Droppiness: ${s.droppinessVerdict}`);
    if (s.capitalPressure) {
      const cp = s.capitalPressure;
      parts.push(
        `Capital Pressure (SEC-evidence based): ${cp.score}/100 (${cp.status}) — ${cp.summary}`
      );
      if (cp.reasons?.length) {
        parts.push('Capital Pressure evidence reasons:');
        parts.push(cp.reasons.map((r) => `  - ${r.label} (${r.points > 0 ? '+' : ''}${r.points})`).join('\n'));
      }
    }
    if (s.insiderTransactionsCount !== undefined) {
      parts.push(`Insider Form 4 filings in last 12mo: ${s.insiderTransactionsCount}`);
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

export { SYSTEM_PROMPT };
