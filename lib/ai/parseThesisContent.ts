// lib/ai/parseThesisContent.ts
//
// Validates and normalizes the JSON object Groq returns for AI thesis.

import type { AiThesisCatalyst, AiThesisResult, CatalystSignificance } from './types';

const VALID_SIGNIFICANCE = new Set<CatalystSignificance>(['high', 'moderate', 'low', 'stale']);

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

function normalizeCatalyst(c: AiThesisCatalyst): AiThesisCatalyst {
  return {
    description: c.description.trim(),
    significance: c.significance,
    rationale: c.rationale.trim(),
    ...(c.date?.trim() ? { date: c.date.trim() } : {}),
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
  const keyRisks = Array.isArray(r.keyRisks)
    ? r.keyRisks.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

  return {
    summary: r.summary.trim(),
    thesis: r.thesis.trim(),
    catalysts,
    keyRisks,
    model,
    generatedAt: new Date().toISOString(),
  };
}
