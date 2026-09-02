// lib/ai/requestThesisLlm.ts
//
// Thesis LLM chain: Groq first (or OpenRouter first when explicitly enabled).
// OpenRouter is used only on Groq rate-limit — not after timeouts or JSON errors.

import { callGroq, getGroqModel, type GroqCallResult, type GroqChatMessage } from './groqClient';
import { recordGroqApiCall } from './groqBudget';
import { callOpenRouter, getOpenRouterModel, isOpenRouterConfigured } from './openRouterClient';

const THESIS_MAX_TOKENS = 900;
/** Stay under Vercel maxDuration with prompt build + KV. */
const THESIS_LLM_BUDGET_MS = 22_000;
const MIN_PROVIDER_MS = 2_500;

export type ThesisLlmResult = GroqCallResult & {
  provider?: 'groq' | 'openrouter';
  model?: string;
};

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
  return process.env.AI_THESIS_OPENROUTER_FIRST === 'true';
}

function remainingBudgetMs(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

async function callGroqOnce(
  messages: GroqChatMessage[],
  deadline: number,
  opts: { temperature?: number; timeoutCap?: number } = {}
): Promise<GroqCallResult> {
  const timeoutMs = Math.min(
    opts.timeoutCap ?? 10_000,
    remainingBudgetMs(deadline) - 1_000
  );
  if (timeoutMs < MIN_PROVIDER_MS) {
    return { success: false, error: 'AI thesis timed out — try again in a moment.' };
  }
  const result = await callGroq(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: opts.temperature ?? 0.2,
    responseFormat: { type: 'json_object' },
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
  const timeoutMs = Math.min(12_000, remainingBudgetMs(deadline) - 1_000);
  if (timeoutMs < MIN_PROVIDER_MS) {
    return { success: false, error: 'AI thesis timed out — try again in a moment.' };
  }
  return callOpenRouter(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: 0.2,
    timeoutMs,
  });
}

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

function groqRateLimitMessage(groq: GroqCallResult): string {
  if (groq.retryAfterSec != null && groq.retryAfterSec < 60) {
    return `Groq tokens-per-minute limit — wait ${groq.retryAfterSec}s. OpenRouter fallback was attempted.`;
  }
  return groq.error ?? 'Groq rate limit reached';
}

/**
 * Request an AI thesis. Default: Groq only (≤2 attempts). OpenRouter only on Groq 429.
 */
export async function requestThesisLlm(messages: GroqChatMessage[]): Promise<ThesisLlmResult> {
  const deadline = Date.now() + THESIS_LLM_BUDGET_MS;

  if (shouldUseOpenRouterFirst()) {
    const orFirst = await tryOpenRouter(messages, deadline);
    if (orFirst?.success) return orFirst;
    if (orFirst?.errorCode === 'rate_limit' && remainingBudgetMs(deadline) >= MIN_PROVIDER_MS) {
      const groq = await callGroqOnce(messages, deadline);
      if (groq.success && groq.content) return withMeta(groq, 'groq', getGroqModel());
    }
    return (
      orFirst ?? {
        success: false,
        error: 'OpenRouter thesis request failed — try again.',
      }
    );
  }

  let groq = await callGroqOnce(messages, deadline);
  if (groq.success && groq.content) {
    return withMeta(groq, 'groq', getGroqModel());
  }

  if (isRateLimited(groq)) {
    const or = await tryOpenRouter(messages, deadline);
    if (or?.success) return or;
    if (or) return or;
    return withMeta({ ...groq, error: groqRateLimitMessage(groq) }, 'groq', getGroqModel());
  }

  if (!groq.success && remainingBudgetMs(deadline) >= MIN_PROVIDER_MS) {
    groq = await callGroqOnce(messages, deadline, { temperature: 0.15, timeoutCap: 8_000 });
    if (groq.success && groq.content) {
      return withMeta(groq, 'groq', getGroqModel());
    }
  }

  return withMeta(groq, 'groq', getGroqModel());
}

/** @deprecated Use requestThesisLlm */
export const requestThesisGroq = requestThesisLlm;
