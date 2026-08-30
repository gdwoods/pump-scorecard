// lib/ai/parseThesisContent.ts

import type {
  AiThesisCatalyst,
  AiThesisForwardDate,
  AiThesisResult,
  CatalystSignificance,
} from './types';
import { FORENSIC_BRIEF_VERSION } from './buildThesisPrompt';

const VALID_SIGNIFICANCE = new Set<CatalystSignificance>(['high', 'moderate', 'low', 'stale']);
const VALID_FORWARD_TAGS = new Set(['verify', 'conflict', 'opinion']);

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function isValidCatalyst(value: unknown): value is AiThesisCatalyst {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  if (typeof c.description !== 'string' || !c.description.trim()) return false;
  if (typeof c.significance !== 'string' || !VALID_SIGNIFICANCE.has(c.significance as CatalystSignificance)) {
    return false;
  }
  if (typeof c.rationale !== 'string' || !c.rationale.trim()) return false;
  if (c.date != null && typeof c.date !== 'string') return false;
  return true;
}

function isValidForwardDate(value: unknown): value is AiThesisForwardDate {
  if (!value || typeof value !== 'object') return false;
  const f = value as Record<string, unknown>;
  if (typeof f.date !== 'string' || !f.date.trim()) return false;
  if (typeof f.event !== 'string' || !f.event.trim()) return false;
  if (typeof f.significance !== 'string' || !VALID_SIGNIFICANCE.has(f.significance as CatalystSignificance)) {
    return false;
  }
  if (f.tag != null && typeof f.tag === 'string') {
    if (f.tag === 'none') return true;
    if (!VALID_FORWARD_TAGS.has(f.tag)) return false;
  }
  return true;
}

function normalizeCatalyst(c: AiThesisCatalyst): AiThesisCatalyst {
  return {
    description: c.description.trim(),
    significance: c.significance,
    rationale: c.rationale.trim(),
    ...(c.date?.trim() ? { date: c.date.trim() } : {}),
  };
}

function normalizeForwardDate(f: AiThesisForwardDate): AiThesisForwardDate {
  const tag = f.tag === 'none' ? undefined : f.tag;
  return {
    date: f.date.trim(),
    event: f.event.trim(),
    significance: f.significance,
    ...(tag ? { tag } : {}),
  };
}

export function parseThesisContent(content: string, model: string): AiThesisResult | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }

  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.summary !== 'string' || !r.summary.trim()) return null;
  if (typeof r.thesis !== 'string' || !r.thesis.trim()) return null;

  const catalysts = Array.isArray(r.catalysts)
    ? r.catalysts.filter(isValidCatalyst).map(normalizeCatalyst)
    : [];
  const forwardDates = Array.isArray(r.forwardDates)
    ? r.forwardDates.filter(isValidForwardDate).map(normalizeForwardDate)
    : [];
  const keyRisks = Array.isArray(r.keyRisks)
    ? r.keyRisks.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  const dataGaps = Array.isArray(r.dataGaps)
    ? r.dataGaps.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

  return {
    summary: r.summary.trim(),
    thesis: r.thesis.trim(),
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
  };
}
