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
import { parseThesisContent } from '@/lib/ai/parseThesisContent';
import { checkAiThesisRateLimit, getClientIpFromHeaders } from '@/lib/ai/rateLimit';
import { SHOW_AI_THESIS } from '@/lib/config/features';
import type { ThesisPromptInput } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

function hasPromptData(body: ThesisPromptInput): boolean {
  return Boolean(body.shortCheck || body.scan || body.extractedData || body.fastVerdict);
}

export async function GET() {
  return NextResponse.json({
    enabled: SHOW_AI_THESIS,
    configured: Boolean(process.env.GROQ_API_KEY),
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!SHOW_AI_THESIS) {
      return NextResponse.json({ success: false, error: 'AI thesis is disabled' });
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'GROQ_API_KEY not configured on the server',
      });
    }

    const clientIp = getClientIpFromHeaders(req.headers);
    const rateLimit = await checkAiThesisRateLimit(clientIp);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `AI thesis rate limit reached — try again in ${rateLimit.retryAfterSec} seconds.`,
        },
        { status: 429 }
      );
    }

    const body = (await req.json()) as ThesisPromptInput;

    if (!body?.ticker) {
      return NextResponse.json({ success: false, error: 'ticker is required' }, { status: 400 });
    }

    if (!hasPromptData(body)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Run a scan first — AI thesis needs Short Check, Fast Verdict, or scan data.',
        },
        { status: 400 }
      );
    }

    const messages = buildThesisMessages(body);
    const groqResult = await callGroq(messages);

    if (!groqResult.success || !groqResult.content) {
      return NextResponse.json({ success: false, error: groqResult.error ?? 'AI thesis unavailable' });
    }

    const thesis = parseThesisContent(groqResult.content, GROQ_MODEL);
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
