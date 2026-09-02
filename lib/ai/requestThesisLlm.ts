// lib/ai/requestThesisLlm.ts
//
// Thesis LLM chain: Groq first with enough time for full scans.
// OpenRouter only on fast Groq failures (JSON/rate-limit) — not after Groq timeouts.

import { callGroq, getGroqModel, type GroqCallResult, type GroqChatMessage } from './groqClient';
import { recordGroqApiCall } from './groqBudget';
import { callOpenRouter, getOpenRouterModel, isOpenRouterConfigured } from './openRouterClient';
import { parseThesisContent } from './parseThesisContent';

const THESIS_MAX_TOKENS = 700;
const THESIS_LLM_BUDGET_MS = 46_000;
const MIN_PROVIDER_MS = 2_000;
/** Full-scan prompts (JLHL ~6KB) often need 15–22s on Groq. */
const GROQ_TIMEOUT_MS = 25_000;
const GROQ_PLAIN_RETRY_TIMEOUT_MS = 12_000;
const OPENROUTER_TIMEOUT_MS = 18_000;

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

function isGroqTimeout(result: GroqCallResult): boolean {
  return Boolean(result.error?.includes('timed out'));
}

/** Nemotron free tier is too slow for fallback — reserve OpenRouter for Groq 429 only. */
function shouldTryOpenRouterAfterGroq(groq: GroqCallResult): boolean {
  return isRateLimited(groq);
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

async function callGroqOnce(
  messages: GroqChatMessage[],
  deadline: number,
  opts: {
    temperature?: number;
    timeoutCap?: number;
    omitResponseFormat?: boolean;
  } = {}
): Promise<GroqCallResult> {
  const timeoutMs = budgetTimeoutMs(deadline, opts.timeoutCap ?? GROQ_TIMEOUT_MS);
  if (timeoutMs < MIN_PROVIDER_MS) return timedOutResult();

  const result = await callGroq(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: opts.temperature ?? 0.2,
    responseFormat: opts.omitResponseFormat ? null : { type: 'json_object' },
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

  let openRouterAttempt: ThesisLlmResult | null = null;
  if (openRouterReady && shouldTryOpenRouterAfterGroq(groq)) {
    openRouterAttempt = await tryOpenRouter(messages, deadline);
    if (openRouterAttempt?.success) return openRouterAttempt;
  }

  if (!groq.success && !isRateLimited(groq) && remainingBudgetMs(deadline) >= MIN_PROVIDER_MS) {
    groq = await callGroqForThesis(messages, deadline, {
      temperature: 0.15,
      timeoutCap: GROQ_PLAIN_RETRY_TIMEOUT_MS,
      omitResponseFormat: true,
    });
    if (groq.success && groq.content) {
      return withMeta(groq, 'groq', getGroqModel());
    }
  }

  if (openRouterAttempt) return preferOpenRouterError(groq, openRouterAttempt);
  return withMeta(groq, 'groq', getGroqModel());
}

/** @deprecated Use requestThesisLlm */
export const requestThesisGroq = requestThesisLlm;
