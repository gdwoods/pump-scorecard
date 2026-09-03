import type { GroqResponseFormat } from './thesisJsonSchema';
//
// Thin wrapper over Groq's OpenAI-compatible chat completions endpoint
// (https://api.groq.com/openai/v1/chat/completions), used for the free-tier
// AI thesis feature. Follows the same conventions as utils/fetchDebtCash.ts
// and utils/fetchCurrentPrice.ts: never throws, returns a discriminated
// result object so callers can degrade gracefully.
//
// Requires GROQ_API_KEY in the environment (server-side only — never
// exposed to the client). Free tier: no credit card, no training opt-in
// on submitted data, ~30 RPM / ~1,000 RPD as of writing. Get a key at
// https://console.groq.com/keys
//
// Rate limit: 10 req/hour per IP on /api/ai-thesis (see lib/ai/rateLimit.ts).
// Set AI_THESIS_RATE_LIMIT_WHITELIST to a comma-separated list of IPs to bypass.

export interface GroqChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface GroqCallResult {
  success: boolean;
  content?: string;
  error?: string;
  /** Groq error code when present (e.g. json_validate_failed, rate_limit, empty_content). */
  errorCode?: string;
  /** Seconds to wait before retrying, when Groq returns 429. */
  retryAfterSec?: number;
}

/** Injectable so route/prompt logic can be verified without a live network call or API key. */
export type GroqFetcher = (apiKey: string, body: Record<string, unknown>) => Promise<Response>;

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
/** Groq retired llama-3.3-70b-versatile 2026-08-16; override via GROQ_MODEL env. */
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';
const REQUEST_TIMEOUT_MS = 12_000;

export function getGroqModel(): string {
  const fromEnv = process.env.GROQ_MODEL?.trim();
  return fromEnv || DEFAULT_GROQ_MODEL;
}

function isGptOssModel(model: string): boolean {
  return model.startsWith('openai/gpt-oss');
}

/** Extract visible assistant text from Groq/OpenAI-compatible chat payloads. */
export function extractGroqContent(data: unknown): string | null {
  const choice = (data as { choices?: Array<{ message?: Record<string, unknown> }> })?.choices?.[0];
  const message = choice?.message;
  if (!message) return null;

  const fromField = (value: unknown): string | null => {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const text = value
        .map((part) => {
          if (typeof part === 'string') return part;
          if (!part || typeof part !== 'object') return '';
          const p = part as { type?: string; text?: string };
          return typeof p.text === 'string' ? p.text : '';
        })
        .join('')
        .trim();
      return text || null;
    }
    return null;
  };

  return fromField(message.content) ?? fromField(message.reasoning) ?? null;
}

function emptyContentError(data: unknown): GroqCallResult {
  const choice = (data as { choices?: Array<{ finish_reason?: string }> })?.choices?.[0];
  const finishReason = choice?.finish_reason;
  const usage = (data as {
    usage?: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
  })?.usage;
  const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
  const completionTokens = usage?.completion_tokens;

  if (finishReason === 'length') {
    return {
      success: false,
      errorCode: 'token_budget',
      error:
        'Groq used the full token budget on reasoning and returned no thesis — retrying with a larger budget.',
    };
  }

  const detail =
    reasoningTokens != null && completionTokens != null
      ? ` (reasoning ${reasoningTokens}/${completionTokens} completion tokens)`
      : '';
  return {
    success: false,
    errorCode: 'empty_content',
    error: `Groq returned an empty response${detail}`,
  };
}

function createTimeoutFetcher(endpoint: string, timeoutMs: number, headers: Record<string, string>): GroqFetcher {
  return (_apiKey, body) =>
    fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
}

/**
 * Call Groq's chat completions endpoint and return the raw assistant
 * message content (expected to be a JSON string — caller parses it).
 * Never throws: missing key, network failure, non-2xx response, and an
 * empty/malformed response all come back as {success: false, error}.
 */
export async function callGroq(
  messages: GroqChatMessage[],
  opts: {
    fetcher?: GroqFetcher;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: GroqResponseFormat | null;
    timeoutMs?: number;
    reasoningEffort?: 'low' | 'medium' | 'high';
  } = {}
): Promise<GroqCallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'GROQ_API_KEY not configured' };
  }

  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const model = getGroqModel();
  const fetcher =
    opts.fetcher ??
    createTimeoutFetcher(GROQ_ENDPOINT, timeoutMs, {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    });

  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      // gpt-oss spends completion tokens on hidden reasoning first — budget must cover both.
      max_completion_tokens: opts.maxTokens ?? 2500,
    };
    const responseFormat =
      opts.responseFormat === null ? undefined : (opts.responseFormat ?? { type: 'json_object' });
    if (responseFormat) {
      body.response_format = responseFormat;
    }
    if (isGptOssModel(model)) {
      body.reasoning_effort = opts.reasoningEffort ?? 'low';
      body.include_reasoning = false;
    }

    const response = await fetcher(apiKey, body);

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSec = retryAfterHeader
          ? Math.max(1, Number.parseInt(retryAfterHeader, 10) || 60)
          : 60;
        return {
          success: false,
          errorCode: 'rate_limit',
          retryAfterSec,
          error:
            retryAfterSec >= 60
              ? `Groq rate limit reached — try again in about ${Math.ceil(retryAfterSec / 60)} minute(s).`
              : `Groq tokens-per-minute limit — wait ${retryAfterSec} seconds before retrying.`,
        };
      }
      const bodyText = await response.text().catch(() => '');
      let errorCode: string | undefined;
      try {
        const parsed = JSON.parse(bodyText) as { error?: { code?: string; message?: string } };
        errorCode = parsed.error?.code;
      } catch {
        // ignore parse failure
      }
      const message =
        errorCode === 'json_validate_failed'
          ? 'Groq could not produce valid thesis JSON — retrying usually works.'
          : `Groq API error ${response.status}: ${bodyText.slice(0, 200)}`;
      return {
        success: false,
        error: message,
        errorCode,
      };
    }

    const data = await response.json();
    const content = extractGroqContent(data);
    if (!content) {
      return emptyContentError(data);
    }

    return { success: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const timedOut =
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError' || /aborted|timeout/i.test(message));
    return {
      success: false,
      error: timedOut
        ? `Groq request timed out after ${Math.round(timeoutMs / 1000)}s`
        : `Groq request failed: ${message}`,
    };
  }
}

export { GROQ_ENDPOINT, DEFAULT_GROQ_MODEL };
