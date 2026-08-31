// lib/ai/requestThesisLlm.ts
//
// Thesis LLM chain: Groq first (or OpenRouter first when configured), with cross-fallback.

import { callGroq, getGroqModel, type GroqCallResult, type GroqChatMessage } from './groqClient';
import { recordGroqApiCall } from './groqBudget';
import { callOpenRouter, getOpenRouterModel, isOpenRouterConfigured } from './openRouterClient';
import { getThesisResponseFormat } from './thesisJsonSchema';

const THESIS_MAX_TOKENS = 1200;

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

async function callGroqOnce(
  messages: GroqChatMessage[],
  strict: boolean
): Promise<GroqCallResult> {
  const result = await callGroq(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: strict ? 0.2 : 0.15,
    responseFormat: getThesisResponseFormat(strict),
  });
  if (result.errorCode !== 'rate_limit') {
    await recordGroqApiCall();
  }
  return result;
}

async function callOpenRouterOnce(messages: GroqChatMessage[]): Promise<GroqCallResult> {
  return callOpenRouter(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: 0.2,
    responseFormat: { type: 'json_object' },
  });
}

/** Returns OpenRouter result when configured; null when OpenRouter is not set up. */
async function tryOpenRouter(messages: GroqChatMessage[]): Promise<ThesisLlmResult | null> {
  if (!isOpenRouterConfigured()) return null;
  const fallback = await callOpenRouterOnce(messages);
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
  if (shouldUseOpenRouterFirst()) {
    const orFirst = await tryOpenRouter(messages);
    if (orFirst?.success) return orFirst;
    // Fall through to Groq when OpenRouter fails (e.g. no credits).
  }

  const groqStrict = await callGroqOnce(messages, true);
  if (groqStrict.success && groqStrict.content) {
    return withMeta(groqStrict, 'groq', getGroqModel());
  }

  if (isRateLimited(groqStrict)) {
    const or = await tryOpenRouter(messages);
    if (or?.success) return or;
    if (or) return or;
    return withMeta(
      { ...groqStrict, error: groqRateLimitMessage(groqStrict) },
      'groq',
      getGroqModel()
    );
  }

  if (isJsonValidateFailure(groqStrict)) {
    const or = await tryOpenRouter(messages);
    if (or?.success) return or;

    const groqRelaxed = await callGroqOnce(messages, false);
    if (groqRelaxed.success && groqRelaxed.content) {
      return withMeta(groqRelaxed, 'groq', getGroqModel());
    }

    if (isRateLimited(groqRelaxed)) {
      const orAfterRateLimit = await tryOpenRouter(messages);
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

  return withMeta(groqStrict, 'groq', getGroqModel());
}

/** @deprecated Use requestThesisLlm */
export const requestThesisGroq = requestThesisLlm;
