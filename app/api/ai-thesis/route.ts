// app/api/ai-thesis/route.ts
//
// On-demand AI thesis synthesis (Groq free tier — see lib/ai/groqClient.ts).
// Client sends the data it already has after a Short Check / Pump Scorecard
// scan; this route never re-fetches SEC/Yahoo data itself. Never throws —
// returns { success: false, error } with 200 so the UI can show a friendly
// "unavailable" state without a hard error boundary, matching the rest of
// this app's fetch-fallback conventions.

import { NextRequest, NextResponse } from 'next/server';
import { callGroq, GROQ_MODEL } from '@/lib/ai/groqClient';
import { buildThesisMessages } from '@/lib/ai/buildThesisPrompt';
import type { AiThesisResult, ThesisPromptInput } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

function isValidCatalystArray(value: unknown): value is AiThesisResult['catalysts'] {
  return (
    Array.isArray(value) &&
    value.every(
      (c) =>
        c &&
        typeof c === 'object' &&
        typeof (c as { description?: unknown }).description === 'string' &&
        typeof (c as { significance?: unknown }).significance === 'string'
    )
  );
}

function parseThesisContent(content: string): AiThesisResult | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }

  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.summary !== 'string' || typeof r.thesis !== 'string') return null;
  const catalysts = isValidCatalystArray(r.catalysts) ? r.catalysts : [];
  const keyRisks = Array.isArray(r.keyRisks) ? r.keyRisks.filter((x) => typeof x === 'string') : [];

  return {
    summary: r.summary,
    thesis: r.thesis,
    catalysts,
    keyRisks,
    model: GROQ_MODEL,
    generatedAt: new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ThesisPromptInput;

    if (!body?.ticker) {
      return NextResponse.json({ success: false, error: 'ticker is required' }, { status: 400 });
    }

    const messages = buildThesisMessages(body);
    const groqResult = await callGroq(messages);

    if (!groqResult.success || !groqResult.content) {
      return NextResponse.json({ success: false, error: groqResult.error ?? 'AI thesis unavailable' });
    }

    const thesis = parseThesisContent(groqResult.content);
    if (!thesis) {
      return NextResponse.json({
        success: false,
        error: 'AI response was not in the expected format — try again.',
      });
    }

    return NextResponse.json({ success: true, thesis });
  } catch (error) {
    console.error('AI thesis API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
