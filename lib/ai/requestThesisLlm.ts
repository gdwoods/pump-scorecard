// lib/ai/requestThesisLlm.ts
//
// Thesis LLM chain: Groq first (or OpenRouter first when explicitly enabled).
// OpenRouter runs on Groq failure when configured. Hard budget keeps responses under Vercel limits.

import { callGroq, getGroqModel, type GroqCallResult, type GroqChatMessage } from './groqClient';
import { recordGroqApiCall } from './groqBudget';
import { callOpenRouter, getOpenRouterModel, isOpenRouterConfigured } from './openRouterClient';
import { parseThesisContent } from './parseThesisContent';

const THESIS_MAX_TOKENS = 700;
/** Hard cap for all provider attempts in one request. */
const THESIS_LLM_BUDGET_MS = 22_000;
const MIN_PROVIDER_MS = 2_000;
const GROQ_FIRST_TIMEOUT_MS = 5_000;
const GROQ_RETRY_TIMEOUT_MS = 4_000;
const OPENROUTER_FALLBACK_TIMEOUT_MS = 14_000;
const OPENROUTER_PRIMARY_TIMEOUT_MS = 18_000;

export type ThesisLlmResult = GroqCallResult & {
  provider?: 'groq' | 'openrouter';
  model?: string;
};

export type ThesisLlmOptions = {
  /** When false, skip Groq (e.g. daily Groq budget exhausted). */
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
    error: 'Groq response was not in the expected format — trying fallback.',
    errorCode: 'parse_failed',
  };
}

function shouldFallbackToOpenRouter(groq: GroqCallResult): boolean {
  if (groq.success) return false;
  if (isRateLimited(groq)) return true;
  return true;
}

async function callGroqOnce(
  messages: GroqChatMessage[],
  deadline: number,
  opts: {
    temperature?: number;
    timeoutCap?: number;
    useJsonObject?: boolean;
    omitResponseFormat?: boolean;
  } = {}
): Promise<GroqCallResult> {
  const timeoutMs = budgetTimeoutMs(deadline, opts.timeoutCap ?? GROQ_FIRST_TIMEOUT_MS);
  if (timeoutMs < MIN_PROVIDER_MS) return timedOutResult();

  const result = await callGroq(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: opts.temperature ?? 0.2,
    responseFormat: opts.omitResponseFormat
      ? null
      : opts.useJsonObject === false
        ? undefined
        : { type: 'json_object' },
    timeoutMs,
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
    useJsonObject?: boolean;
    omitResponseFormat?: boolean;
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
  deadline: number,
  timeoutCap: number
): Promise<GroqCallResult> {
  const timeoutMs = budgetTimeoutMs(deadline, timeoutCap);
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
  deadline: number,
  timeoutCap: number
): Promise<ThesisLlmResult | null> {
  if (!isOpenRouterConfigured()) return null;
  const fallback = await callOpenRouterForThesis(messages, deadline, timeoutCap);
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

function preferOpenRouterError(groq: GroqCallResult, or: ThesisLlmResult): ThesisLlmResult {
  if (or.success) return or;
  if (isRateLimited(groq)) {
    return withMeta({ ...groq, error: groqRateLimitMessage(groq) }, 'groq', getGroqModel());
  }
  return or;
}

/**
 * Request an AI thesis. Default: Groq (≤2 attempts), then OpenRouter on failure when configured.
 */
export async function requestThesisLlm(
  messages: GroqChatMessage[],
  options: ThesisLlmOptions = {}
): Promise<ThesisLlmResult> {
  const deadline = Date.now() + THESIS_LLM_BUDGET_MS;
  const groqAllowed = options.groqAllowed !== false && Boolean(process.env.GROQ_API_KEY);
  const openRouterReady = isOpenRouterConfigured();

  if (shouldUseOpenRouterFirst()) {
    const orFirst = await tryOpenRouter(messages, deadline, OPENROUTER_PRIMARY_TIMEOUT_MS);
    if (orFirst?.success) return orFirst;
    if (
      groqAllowed &&
      orFirst?.errorCode === 'rate_limit' &&
      remainingBudgetMs(deadline) >= MIN_PROVIDER_MS
    ) {
      const groq = await callGroqForThesis(messages, deadline);
      if (groq.success && groq.content) return withMeta(groq, 'groq', getGroqModel());
    }
    return (
      orFirst ?? {
        success: false,
        error: 'OpenRouter thesis request failed — try again.',
      }
    );
  }

  if (!groqAllowed) {
    const orOnly = await tryOpenRouter(messages, deadline, OPENROUTER_PRIMARY_TIMEOUT_MS);
    return (
      orOnly ?? {
        success: false,
        error: 'Groq daily capacity reached — OpenRouter is not configured.',
      }
    );
  }

  let groq = await callGroqForThesis(messages, deadline, { timeoutCap: GROQ_FIRST_TIMEOUT_MS });
  if (groq.success && groq.content) {
    return withMeta(groq, 'groq', getGroqModel());
  }

  if (
    !groq.success &&
    !isRateLimited(groq) &&
    remainingBudgetMs(deadline) >= MIN_PROVIDER_MS &&
    !openRouterReady
  ) {
    groq = await callGroqForThesis(messages, deadline, {
      temperature: 0.15,
      timeoutCap: GROQ_RETRY_TIMEOUT_MS,
      omitResponseFormat: true,
    });
    if (groq.success && groq.content) {
      return withMeta(groq, 'groq', getGroqModel());
    }
  }

  if (openRouterReady && shouldFallbackToOpenRouter(groq)) {
    const or = await tryOpenRouter(messages, deadline, OPENROUTER_FALLBACK_TIMEOUT_MS);
    if (or?.success) return or;
    if (or) return preferOpenRouterError(groq, or);
  }

  return withMeta(groq, 'groq', getGroqModel());
}

/** Hard wall-clock cap so the route always returns JSON before platform timeout. */
export function withThesisLlmDeadline(
  messages: GroqChatMessage[],
  options: ThesisLlmOptions = {},
  budgetMs = 24_000
): Promise<ThesisLlmResult> {
  return Promise.race([
    requestThesisLlm(messages, options),
    new Promise<ThesisLlmResult>((resolve) => {
      setTimeout(() => resolve(timedOutResult()), budgetMs);
    }),
  ]);
}

/** @deprecated Use requestThesisLlm */
export const requestThesisGroq = requestThesisLlm;
