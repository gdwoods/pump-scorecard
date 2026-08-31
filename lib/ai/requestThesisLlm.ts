// lib/ai/requestThesisLlm.ts
//
// Thesis LLM chain: one Groq call, then OpenRouter fallback on rate limit or JSON failure.

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
    // OpenRouter models expect json_object; Groq json_schema strict mode is Groq-only.
    responseFormat: { type: 'json_object' },
  });
}

async function tryOpenRouterFallback(messages: GroqChatMessage[]): Promise<ThesisLlmResult | null> {
  if (!isOpenRouterConfigured()) return null;
  const fallback = await callOpenRouterOnce(messages);
  if (fallback.success && fallback.content) {
    return withMeta(fallback, 'openrouter', getOpenRouterModel());
  }
  return null;
}

/**
 * Request an AI thesis with at most one Groq call, then optional OpenRouter fallback.
 */
export async function requestThesisLlm(messages: GroqChatMessage[]): Promise<ThesisLlmResult> {
  const groqStrict = await callGroqOnce(messages, true);
  if (groqStrict.success && groqStrict.content) {
    return withMeta(groqStrict, 'groq', getGroqModel());
  }

  if (isRateLimited(groqStrict)) {
    if (isOpenRouterConfigured()) {
      const fallback = await callOpenRouterOnce(messages);
      if (fallback.success && fallback.content) {
        return withMeta(fallback, 'openrouter', getOpenRouterModel());
      }
      return withMeta(
        {
          success: false,
          error:
            fallback.error ??
            'Groq tokens-per-minute limit hit and OpenRouter fallback failed — try again shortly.',
          errorCode: fallback.errorCode ?? groqStrict.errorCode,
          retryAfterSec: fallback.retryAfterSec ?? groqStrict.retryAfterSec,
        },
        'openrouter',
        getOpenRouterModel()
      );
    }
    return withMeta(
      {
        ...groqStrict,
        error:
          groqStrict.retryAfterSec != null && groqStrict.retryAfterSec < 60
            ? `Groq tokens-per-minute limit — wait ${groqStrict.retryAfterSec}s. Add OPENROUTER_API_KEY on the server for automatic fallback.`
            : groqStrict.error,
      },
      'groq',
      getGroqModel()
    );
  }

  if (isJsonValidateFailure(groqStrict)) {
    const fallback = await tryOpenRouterFallback(messages);
    if (fallback) return fallback;

    const groqRelaxed = await callGroqOnce(messages, false);
    if (groqRelaxed.success && groqRelaxed.content) {
      return withMeta(groqRelaxed, 'groq', getGroqModel());
    }
    if (isRateLimited(groqRelaxed)) {
      const orFallback = await tryOpenRouterFallback(messages);
      if (orFallback) return orFallback;
    }
    return withMeta(groqRelaxed, 'groq', getGroqModel());
  }

  return withMeta(groqStrict, 'groq', getGroqModel());
}

/** @deprecated Use requestThesisLlm */
export const requestThesisGroq = requestThesisLlm;
