// app/api/ai-thesis/route.ts
//
// On-demand AI thesis synthesis (Groq free tier — see lib/ai/groqClient.ts).
// Client sends the data it already has after a Short Check / Pump Scorecard
// scan; this route never re-fetches SEC/Yahoo data itself. Never throws —
// returns { success: false, error } with 200 so the UI can show a friendly
// "unavailable" state without a hard error boundary, matching the rest of
// this app's fetch-fallback conventions.

import { NextRequest, NextResponse } from 'next/server';
import { buildThesisMessages } from '@/lib/ai/buildThesisPrompt';
import { parseThesisContent } from '@/lib/ai/parseThesisContent';
import { withThesisLlmDeadline } from '@/lib/ai/requestThesisLlm';
import { isOpenRouterConfigured } from '@/lib/ai/openRouterClient';
import { checkAiThesisRateLimit, getClientIpFromHeaders } from '@/lib/ai/rateLimit';
import { checkGroqDailyBudget, formatGroqBudgetError } from '@/lib/ai/groqBudget';
import { readCachedThesis, writeCachedThesis } from '@/lib/ai/thesisCache';
import { SHOW_AI_THESIS } from '@/lib/config/features';
import type { ThesisPromptInput } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function hasPromptData(body: ThesisPromptInput): boolean {
  return Boolean(body.shortCheck || body.scan || body.extractedData || body.fastVerdict);
}

export async function GET() {
  const groq = Boolean(process.env.GROQ_API_KEY);
  const openRouter = isOpenRouterConfigured();
  return NextResponse.json({
    enabled: SHOW_AI_THESIS,
    configured: groq || openRouter,
    groq,
    openRouterFallback: openRouter,
    openRouterFirst: process.env.AI_THESIS_OPENROUTER_FIRST === 'true' && openRouter,
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!SHOW_AI_THESIS) {
      return NextResponse.json({ success: false, error: 'AI thesis is disabled' });
    }

    if (!process.env.GROQ_API_KEY && !isOpenRouterConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'AI thesis not configured — set GROQ_API_KEY and/or OPENROUTER_API_KEY on the server',
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

    const cached = await readCachedThesis(body);
    if (cached) {
      return NextResponse.json({
        success: true,
        thesis: cached.thesis,
        cached: true,
        sharedCache: cached.source === 'ticker',
      });
    }

    const groqBudget = await checkGroqDailyBudget();
    const groqAllowed = !process.env.GROQ_API_KEY || groqBudget.allowed;
    if (process.env.GROQ_API_KEY && !groqBudget.allowed && !isOpenRouterConfigured()) {
      return NextResponse.json({
        success: false,
        error: formatGroqBudgetError(groqBudget.retryAfterSec, groqBudget.limit),
      });
    }

    const messages = (() => {
      try {
        return buildThesisMessages(body);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Prompt build failed';
        throw new Error(`AI thesis prompt error: ${msg}`);
      }
    })();
    const llmResult = await withThesisLlmDeadline(messages, { groqAllowed });

    if (!llmResult.success || !llmResult.content) {
      return NextResponse.json({
        success: false,
        error: llmResult.error ?? 'AI thesis unavailable',
        errorCode: llmResult.errorCode,
        retryAfterSec: llmResult.retryAfterSec,
      });
    }

    const thesis = parseThesisContent(
      llmResult.content,
      llmResult.model ?? 'unknown'
    );
    if (!thesis) {
      return NextResponse.json({
        success: false,
        error: 'AI response was not in the expected format — try again.',
      });
    }

    void writeCachedThesis(body, thesis).catch((err) => {
      console.warn('AI thesis cache write failed:', err);
    });

    return NextResponse.json({
      success: true,
      thesis,
      provider: llmResult.provider,
      cached: false,
    });
  } catch (error) {
    console.error('AI thesis API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
