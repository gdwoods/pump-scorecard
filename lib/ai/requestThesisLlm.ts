// lib/ai/requestThesisLlm.ts
//
// Thesis LLM chain: Groq first (or OpenRouter first when configured), with cross-fallback.
// Total LLM wall time is capped so /api/ai-thesis stays under Vercel maxDuration (30s).

import { callGroq, getGroqModel, type GroqCallResult, type GroqChatMessage } from './groqClient';
import { recordGroqApiCall } from './groqBudget';
import { callOpenRouter, getOpenRouterModel, isOpenRouterConfigured } from './openRouterClient';
import { getThesisResponseFormat } from './thesisJsonSchema';

const THESIS_MAX_TOKENS = 1200;
/** Keep under route maxDuration (30s) including prompt build + cache I/O. */
const THESIS_LLM_BUDGET_MS = 26_000;
const MIN_PROVIDER_MS = 3_000;

export type ThesisLlmResult = GroqCallResult & {
  provider?: 'groq' | 'openrouter';
  model?: string;
};

function isJsonValidateFailure(result: GroqCallResult): boolean {
  return result.errorCode === 'json_validate_failed';
}

function isRateLimited(result: GroqCallResult): boolean {
  return result.errorCode === 'rate_limit';
}

function withMeta(
  result: GroqCallResult,
  provider: ThesisLlmResult['provider'],
  model: string
): ThesisLlmResult {
  return { ...result, provider, model };
}

function shouldUseOpenRouterFirst(): boolean {
  if (!isOpenRouterConfigured()) return false;
  return process.env.AI_THESIS_OPENROUTER_FIRST !== 'false';
}

function remainingBudgetMs(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

async function callGroqOnce(
  messages: GroqChatMessage[],
  strict: boolean,
  deadline: number
): Promise<GroqCallResult> {
  const timeoutMs = Math.min(15_000, remainingBudgetMs(deadline) - 1_000);
  if (timeoutMs < MIN_PROVIDER_MS) {
    return { success: false, error: 'AI thesis timed out before Groq could run — try again.' };
  }
  const result = await callGroq(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: strict ? 0.2 : 0.15,
    responseFormat: getThesisResponseFormat(strict),
    timeoutMs,
  });
  if (result.errorCode !== 'rate_limit') {
    await recordGroqApiCall();
  }
  return result;
}

async function callOpenRouterOnce(
  messages: GroqChatMessage[],
  deadline: number
): Promise<GroqCallResult> {
  const timeoutMs = Math.min(18_000, remainingBudgetMs(deadline) - 2_000);
  if (timeoutMs < MIN_PROVIDER_MS) {
    return {
      success: false,
      error: 'AI thesis timed out before OpenRouter could run — try again.',
    };
  }
  // Prompt enforces JSON; Nemotron free tier is more reliable without response_format.
  return callOpenRouter(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: 0.2,
    timeoutMs,
  });
}

/** Returns OpenRouter result when configured; null when OpenRouter is not set up. */
async function tryOpenRouter(
  messages: GroqChatMessage[],
  deadline: number
): Promise<ThesisLlmResult | null> {
  if (!isOpenRouterConfigured()) return null;
  const fallback = await callOpenRouterOnce(messages, deadline);
  if (fallback.success && fallback.content) {
    return withMeta(fallback, 'openrouter', getOpenRouterModel());
  }
  return withMeta(
    {
      success: false,
      error: fallback.error ?? 'OpenRouter fallback failed',
      errorCode: fallback.errorCode,
      retryAfterSec: fallback.retryAfterSec,
    },
    'openrouter',
    getOpenRouterModel()
  );
}

function groqRateLimitMessage(groqStrict: GroqCallResult): string {
  if (groqStrict.retryAfterSec != null && groqStrict.retryAfterSec < 60) {
    return `Groq tokens-per-minute limit — wait ${groqStrict.retryAfterSec}s. Add OPENROUTER_API_KEY on the server for automatic fallback.`;
  }
  return groqStrict.error ?? 'Groq rate limit reached';
}

/**
 * Request an AI thesis with Groq/OpenRouter cross-fallback.
 */
export async function requestThesisLlm(messages: GroqChatMessage[]): Promise<ThesisLlmResult> {
  const deadline = Date.now() + THESIS_LLM_BUDGET_MS;

  if (shouldUseOpenRouterFirst()) {
    const orFirst = await tryOpenRouter(messages, deadline);
    if (orFirst?.success) return orFirst;
    if (remainingBudgetMs(deadline) < MIN_PROVIDER_MS) {
      return (
        orFirst ?? {
          success: false,
          error: 'AI thesis timed out — try again in a moment.',
        }
      );
    }
  }

  const groqStrict = await callGroqOnce(messages, true, deadline);
  if (groqStrict.success && groqStrict.content) {
    return withMeta(groqStrict, 'groq', getGroqModel());
  }

  if (isRateLimited(groqStrict)) {
    const or = await tryOpenRouter(messages, deadline);
    if (or?.success) return or;
    if (or) return or;
    return withMeta(
      { ...groqStrict, error: groqRateLimitMessage(groqStrict) },
      'groq',
      getGroqModel()
    );
  }

  if (isJsonValidateFailure(groqStrict)) {
    const or = await tryOpenRouter(messages, deadline);
    if (or?.success) return or;

    if (remainingBudgetMs(deadline) >= MIN_PROVIDER_MS) {
      const groqRelaxed = await callGroqOnce(messages, false, deadline);
      if (groqRelaxed.success && groqRelaxed.content) {
        return withMeta(groqRelaxed, 'groq', getGroqModel());
      }

      if (isRateLimited(groqRelaxed)) {
        const orAfterRateLimit = await tryOpenRouter(messages, deadline);
        if (orAfterRateLimit?.success) return orAfterRateLimit;
        if (orAfterRateLimit) return orAfterRateLimit;
        return withMeta(
          { ...groqRelaxed, error: groqRateLimitMessage(groqRelaxed) },
          'groq',
          getGroqModel()
        );
      }

      if (or && !or.success) return or;
      return withMeta(groqRelaxed, 'groq', getGroqModel());
    }

    if (or && !or.success) return or;
  }

  if (!shouldUseOpenRouterFirst()) {
    const or = await tryOpenRouter(messages, deadline);
    if (or?.success) return or;
    if (or && !or.success && !groqStrict.success) return or;
  }

  return withMeta(groqStrict, 'groq', getGroqModel());
}

/** @deprecated Use requestThesisLlm */
export const requestThesisGroq = requestThesisLlm;
