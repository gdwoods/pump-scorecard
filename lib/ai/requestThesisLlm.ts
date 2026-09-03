// lib/ai/requestThesisLlm.ts
//
// Thesis LLM chain: Groq first, compact Groq retry on bad JSON, OpenRouter on Groq 429.

import { callGroq, getGroqModel, type GroqCallResult, type GroqChatMessage } from './groqClient';
import { recordGroqApiCall } from './groqBudget';
import { callOpenRouter, getOpenRouterModel, isOpenRouterConfigured } from './openRouterClient';
import { parseThesisContent } from './parseThesisContent';

const THESIS_MAX_TOKENS = 2500;
const THESIS_RETRY_MAX_TOKENS = 3500;
const THESIS_LLM_BUDGET_MS = 46_000;
const MIN_PROVIDER_MS = 2_000;
const GROQ_TIMEOUT_MS = 20_000;
const GROQ_PLAIN_RETRY_TIMEOUT_MS = 14_000;
const OPENROUTER_TIMEOUT_MS = 22_000;

export type ThesisLlmResult = GroqCallResult & {
  provider?: 'groq' | 'openrouter';
  model?: string;
};

export type ThesisLlmOptions = {
  groqAllowed?: boolean;
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

function budgetTimeoutMs(deadline: number, capMs: number): number {
  return Math.min(capMs, remainingBudgetMs(deadline) - 500);
}

function timedOutResult(): GroqCallResult {
  return { success: false, error: 'AI thesis timed out — try again in a moment.' };
}

function parseFailureResult(): GroqCallResult {
  return {
    success: false,
    error: 'AI response was not in the expected format — try again.',
    errorCode: 'parse_failed',
  };
}

function compactMessages(messages: GroqChatMessage[]): GroqChatMessage[] {
  return [
    messages[0],
    {
      role: 'user',
      content: `${messages[1]?.content ?? ''}\n\nReturn ONLY compact valid JSON. Max 3 catalysts. Keep summary ≤2 sentences and thesis ≤120 words. Use empty strings for optional fields. keyRisks must be a string array.`,
    },
  ];
}

async function callGroqOnce(
  messages: GroqChatMessage[],
  deadline: number,
  opts: {
    temperature?: number;
    timeoutCap?: number;
    omitResponseFormat?: boolean;
    maxTokens?: number;
  } = {}
): Promise<GroqCallResult> {
  const timeoutMs = budgetTimeoutMs(deadline, opts.timeoutCap ?? GROQ_TIMEOUT_MS);
  if (timeoutMs < MIN_PROVIDER_MS) return timedOutResult();

  const result = await callGroq(messages, {
    maxTokens: opts.maxTokens ?? THESIS_MAX_TOKENS,
    temperature: opts.temperature ?? 0.2,
    responseFormat: opts.omitResponseFormat ? null : { type: 'json_object' },
    timeoutMs,
    reasoningEffort: 'low',
  });
  if (result.errorCode !== 'rate_limit') {
    await recordGroqApiCall();
  }
  return result;
}

async function callGroqForThesis(
  messages: GroqChatMessage[],
  deadline: number,
  opts: {
    temperature?: number;
    timeoutCap?: number;
    omitResponseFormat?: boolean;
    maxTokens?: number;
  } = {}
): Promise<GroqCallResult> {
  const result = await callGroqOnce(messages, deadline, opts);
  if (!result.success || !result.content) return result;

  const model = getGroqModel();
  if (parseThesisContent(result.content, model)) return result;
  return parseFailureResult();
}

async function callOpenRouterForThesis(
  messages: GroqChatMessage[],
  deadline: number
): Promise<GroqCallResult> {
  const timeoutMs = budgetTimeoutMs(deadline, OPENROUTER_TIMEOUT_MS);
  if (timeoutMs < MIN_PROVIDER_MS) return timedOutResult();

  const result = await callOpenRouter(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: 0.2,
    timeoutMs,
  });
  if (!result.success || !result.content) return result;

  const model = getOpenRouterModel();
  if (parseThesisContent(result.content, model)) return result;
  return {
    success: false,
    error: 'OpenRouter response was not in the expected format — try again.',
    errorCode: 'parse_failed',
  };
}

async function tryOpenRouter(
  messages: GroqChatMessage[],
  deadline: number
): Promise<ThesisLlmResult | null> {
  if (!isOpenRouterConfigured()) return null;
  const fallback = await callOpenRouterForThesis(messages, deadline);
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

function rateLimitResult(groq: GroqCallResult, openRouterTried: boolean): ThesisLlmResult {
  const wait = groq.retryAfterSec ?? 30;
  const base =
    wait >= 60
      ? `Groq rate limit — try again in about ${Math.ceil(wait / 60)} minute(s).`
      : `Groq tokens-per-minute limit — wait ${wait}s before retrying.`;
  return withMeta(
    {
      success: false,
      errorCode: 'rate_limit',
      retryAfterSec: wait,
      error: openRouterTried
        ? `${base} OpenRouter fallback was attempted.`
        : `${base} OpenRouter is not configured for fallback.`,
    },
    'groq',
    getGroqModel()
  );
}

export async function requestThesisLlm(
  messages: GroqChatMessage[],
  options: ThesisLlmOptions = {}
): Promise<ThesisLlmResult> {
  const deadline = Date.now() + THESIS_LLM_BUDGET_MS;
  const groqAllowed = options.groqAllowed !== false && Boolean(process.env.GROQ_API_KEY);
  const openRouterReady = isOpenRouterConfigured();

  if (shouldUseOpenRouterFirst()) {
    const orFirst = await tryOpenRouter(messages, deadline);
    if (orFirst?.success) return orFirst;
    if (groqAllowed && remainingBudgetMs(deadline) >= MIN_PROVIDER_MS) {
      const groq = await callGroqForThesis(messages, deadline);
      if (groq.success && groq.content) return withMeta(groq, 'groq', getGroqModel());
    }
    return orFirst ?? { success: false, error: 'OpenRouter thesis request failed — try again.' };
  }

  if (!groqAllowed) {
    const orOnly = await tryOpenRouter(messages, deadline);
    return (
      orOnly ?? {
        success: false,
        error: 'Groq daily capacity reached — OpenRouter is not configured.',
      }
    );
  }

  let groq = await callGroqForThesis(messages, deadline);
  if (groq.success && groq.content) {
    return withMeta(groq, 'groq', getGroqModel());
  }

  // Rate limit on first attempt → OpenRouter immediately (do not burn another Groq call).
  if (isRateLimited(groq)) {
    if (openRouterReady && remainingBudgetMs(deadline) >= MIN_PROVIDER_MS) {
      const or = await tryOpenRouter(compactMessages(messages), deadline);
      if (or?.success) return or;
      return rateLimitResult(groq, true);
    }
    return rateLimitResult(groq, false);
  }

  // Bad JSON / empty / token-budget → compact plain Groq retry with a larger completion budget.
  if (remainingBudgetMs(deadline) >= MIN_PROVIDER_MS) {
    groq = await callGroqForThesis(compactMessages(messages), deadline, {
      temperature: 0.1,
      timeoutCap: GROQ_PLAIN_RETRY_TIMEOUT_MS,
      omitResponseFormat: true,
      maxTokens: THESIS_RETRY_MAX_TOKENS,
    });
    if (groq.success && groq.content) {
      return withMeta(groq, 'groq', getGroqModel());
    }
  }

  // Compact retry hit rate limit → OpenRouter.
  if (isRateLimited(groq)) {
    if (openRouterReady && remainingBudgetMs(deadline) >= MIN_PROVIDER_MS) {
      const or = await tryOpenRouter(compactMessages(messages), deadline);
      if (or?.success) return or;
      return rateLimitResult(groq, true);
    }
    return rateLimitResult(groq, false);
  }

  return withMeta(groq, 'groq', getGroqModel());
}

/** @deprecated Use requestThesisLlm */
export const requestThesisGroq = requestThesisLlm;
