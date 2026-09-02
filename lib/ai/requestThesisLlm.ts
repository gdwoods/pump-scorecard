// lib/ai/requestThesisLlm.ts
//
// Thesis LLM chain: Groq first (or OpenRouter first when explicitly enabled).
// OpenRouter runs on Groq rate-limit, JSON validation failure, timeout, or bad parse.

import { callGroq, getGroqModel, type GroqCallResult, type GroqChatMessage } from './groqClient';
import { recordGroqApiCall } from './groqBudget';
import { callOpenRouter, getOpenRouterModel, isOpenRouterConfigured } from './openRouterClient';
import { parseThesisContent } from './parseThesisContent';
import { getThesisResponseFormat, type GroqResponseFormat } from './thesisJsonSchema';

const THESIS_MAX_TOKENS = 900;
/** Stay under Vercel maxDuration with prompt build + KV. */
const THESIS_LLM_BUDGET_MS = 28_000;
const MIN_PROVIDER_MS = 2_500;

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

function shouldFallbackToOpenRouter(groq: GroqCallResult): boolean {
  if (groq.success) return false;
  if (isRateLimited(groq)) return true;
  if (groq.errorCode === 'json_validate_failed') return true;
  if (groq.errorCode === 'parse_failed') return true;
  if (groq.error?.includes('timed out')) return true;
  if (groq.error?.includes('empty response')) return true;
  return true;
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
    responseFormat?: GroqResponseFormat | null;
  } = {}
): Promise<GroqCallResult> {
  const timeoutMs = Math.min(
    opts.timeoutCap ?? 9_000,
    remainingBudgetMs(deadline) - 1_000
  );
  if (timeoutMs < MIN_PROVIDER_MS) {
    return { success: false, error: 'AI thesis timed out — try again in a moment.' };
  }

  const responseFormat =
    opts.responseFormat === null
      ? undefined
      : (opts.responseFormat ?? getThesisResponseFormat());

  const result = await callGroq(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: opts.temperature ?? 0.2,
    responseFormat,
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
    responseFormat?: GroqResponseFormat | null;
  } = {}
): Promise<GroqCallResult> {
  const result = await callGroqOnce(messages, deadline, opts);
  if (!result.success || !result.content) return result;

  const model = getGroqModel();
  if (parseThesisContent(result.content, model)) return result;
  return parseFailureResult();
}

async function callOpenRouterOnce(
  messages: GroqChatMessage[],
  deadline: number
): Promise<GroqCallResult> {
  const timeoutMs = Math.min(16_000, remainingBudgetMs(deadline) - 1_000);
  if (timeoutMs < MIN_PROVIDER_MS) {
    return { success: false, error: 'AI thesis timed out — try again in a moment.' };
  }
  return callOpenRouter(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: 0.2,
    timeoutMs,
  });
}

async function callOpenRouterForThesis(
  messages: GroqChatMessage[],
  deadline: number
): Promise<GroqCallResult> {
  const result = await callOpenRouterOnce(messages, deadline);
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

/**
 * Request an AI thesis. Default: one Groq attempt, then OpenRouter on failure when configured.
 */
export async function requestThesisLlm(
  messages: GroqChatMessage[],
  options: ThesisLlmOptions = {}
): Promise<ThesisLlmResult> {
  const deadline = Date.now() + THESIS_LLM_BUDGET_MS;
  const groqAllowed = options.groqAllowed !== false && Boolean(process.env.GROQ_API_KEY);

  if (shouldUseOpenRouterFirst()) {
    const orFirst = await tryOpenRouter(messages, deadline);
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

  if (isOpenRouterConfigured() && shouldFallbackToOpenRouter(groq)) {
    const or = await tryOpenRouter(messages, deadline);
    if (or?.success) return or;
    if (or) return preferOpenRouterError(groq, or);
  }

  if (!groq.success && remainingBudgetMs(deadline) >= MIN_PROVIDER_MS && !isOpenRouterConfigured()) {
    groq = await callGroqForThesis(messages, deadline, {
      temperature: 0.15,
      timeoutCap: 8_000,
      responseFormat: null,
    });
    if (groq.success && groq.content) {
      return withMeta(groq, 'groq', getGroqModel());
    }
  }

  return withMeta(groq, 'groq', getGroqModel());
}

/** @deprecated Use requestThesisLlm */
export const requestThesisGroq = requestThesisLlm;
