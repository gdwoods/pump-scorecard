// lib/ai/parseThesisContent.ts

import type {
  AiThesisCatalyst,
  AiThesisForwardDate,
  AiThesisResult,
  CatalystSignificance,
} from './types';
import { FORENSIC_BRIEF_VERSION } from './buildThesisPrompt';
import { sanitizeThesisTextFields } from './correctThesisMislabels';

const VALID_SIGNIFICANCE = new Set<CatalystSignificance>(['high', 'moderate', 'low', 'stale']);
const VALID_FORWARD_TAGS = new Set(['verify', 'conflict', 'opinion']);

function optionalString(value: unknown): string | undefined {
  const s = coerceString(value);
  return s || undefined;
}

/** Models often return numbers, arrays, or nested blobs for prose fields. */
function coerceString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceString(item))
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const key of ['text', 'content', 'value', 'summary', 'thesis']) {
      const inner = coerceString(o[key]);
      if (inner) return inner;
    }
  }
  return '';
}

function coerceSignificance(value: unknown): CatalystSignificance | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (VALID_SIGNIFICANCE.has(normalized as CatalystSignificance)) {
    return normalized as CatalystSignificance;
  }
  if (normalized === 'medium' || normalized === 'med') return 'moderate';
  if (normalized === 'critical' || normalized === 'severe') return 'high';
  return null;
}

function normalizeCatalyst(value: unknown): AiThesisCatalyst | null {
  if (!value || typeof value !== 'object') {
    const asText = coerceString(value);
    if (!asText) return null;
    return { description: asText, significance: 'moderate', rationale: asText };
  }
  const c = value as Record<string, unknown>;
  const description = coerceString(c.description) || coerceString(c.title) || coerceString(c.event);
  if (!description) return null;
  const significance = coerceSignificance(c.significance) ?? 'moderate';
  const rationale = coerceString(c.rationale) || coerceString(c.reason) || description;
  const date = coerceString(c.date);
  return {
    description,
    significance,
    rationale,
    ...(date ? { date } : {}),
  };
}

function normalizeForwardDate(value: unknown): AiThesisForwardDate | null {
  if (!value || typeof value !== 'object') return null;
  const f = value as Record<string, unknown>;
  const date = coerceString(f.date);
  const event = coerceString(f.event) || coerceString(f.description);
  if (!date || !event) return null;
  const significance = coerceSignificance(f.significance) ?? 'moderate';
  const rawTag = coerceString(f.tag).toLowerCase();
  const tag =
    !rawTag || rawTag === 'none'
      ? undefined
      : VALID_FORWARD_TAGS.has(rawTag)
        ? (rawTag as AiThesisForwardDate['tag'])
        : undefined;
  return { date, event, significance, ...(tag ? { tag } : {}) };
}

function parseThesisJson(content: string): unknown | null {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf('{');
  if (start >= 0) {
    const end = trimmed.lastIndexOf('}');
    const slice = end > start ? trimmed.slice(start, end + 1) : trimmed.slice(start);
    try {
      return JSON.parse(slice);
    } catch {
      const repaired = tryRepairTruncatedJson(slice);
      if (repaired) return repaired;
      return null;
    }
  }
  return null;
}

function tryRepairTruncatedJson(slice: string): unknown | null {
  let candidate = slice.replace(/,\s*$/, '');
  // Close an open string if quotes are unmatched (ignore escaped quotes).
  let inString = false;
  let escaped = false;
  for (const ch of candidate) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
  }
  if (inString) candidate += '"';
  candidate = candidate.replace(/,\s*$/, '');

  const stack: string[] = [];
  inString = false;
  escaped = false;
  for (const ch of candidate) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if ((ch === '}' || ch === ']') && stack.length) stack.pop();
  }
  candidate += stack.reverse().join('');

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function unwrapThesisObject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (coerceString(r.summary) && coerceString(r.thesis)) return r;
  for (const key of ['result', 'data', 'response', 'thesis', 'output']) {
    const nested = r[key];
    if (nested && typeof nested === 'object') {
      const n = nested as Record<string, unknown>;
      if (coerceString(n.summary) && coerceString(n.thesis)) return n;
    }
  }
  return r;
}

export function parseThesisContent(content: string, model: string): AiThesisResult | null {
  const raw = parseThesisJson(content);
  const r = unwrapThesisObject(raw);
  if (!r) return null;

  const summary = coerceString(r.summary);
  const thesis = coerceString(r.thesis) || coerceString(r.analysis) || coerceString(r.narrative);
  if (!summary || !thesis) return null;

  const catalysts = Array.isArray(r.catalysts)
    ? r.catalysts.map(normalizeCatalyst).filter((c): c is AiThesisCatalyst => Boolean(c))
    : [];
  const forwardDates = Array.isArray(r.forwardDates)
    ? r.forwardDates.map(normalizeForwardDate).filter((f): f is AiThesisForwardDate => Boolean(f))
    : [];
  const keyRisks = Array.isArray(r.keyRisks)
    ? r.keyRisks.map(coerceString).filter(Boolean)
    : coerceString(r.keyRisks)
      ? [coerceString(r.keyRisks)]
      : [];
  const dataGaps = Array.isArray(r.dataGaps)
    ? r.dataGaps.map(coerceString).filter(Boolean)
    : [];

  return sanitizeThesisTextFields({
    summary,
    thesis,
    regulatoryAlert: optionalString(r.regulatoryAlert),
    rubricNarrative: optionalString(r.rubricNarrative),
    ceoLens: optionalString(r.ceoLens),
    traderLens: optionalString(r.traderLens),
    catalysts,
    forwardDates: forwardDates.length ? forwardDates : undefined,
    dataGaps: dataGaps.length ? dataGaps : undefined,
    keyRisks,
    model,
    generatedAt: new Date().toISOString(),
    reportVersion: FORENSIC_BRIEF_VERSION,
  });
}
