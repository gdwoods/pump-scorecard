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
  /** Groq error code when present (e.g. json_validate_failed). */
  errorCode?: string;
}

/** Injectable so route/prompt logic can be verified without a live network call or API key. */
export type GroqFetcher = (apiKey: string, body: Record<string, unknown>) => Promise<Response>;

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
/** Groq retired llama-3.3-70b-versatile 2026-08-16; override via GROQ_MODEL env. */
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
const REQUEST_TIMEOUT_MS = 20_000;

export function getGroqModel(): string {
  const fromEnv = process.env.GROQ_MODEL?.trim();
  return fromEnv || DEFAULT_GROQ_MODEL;
}

const defaultFetcher: GroqFetcher = (apiKey, body) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
};

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
    responseFormat?: GroqResponseFormat;
  } = {}
): Promise<GroqCallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'GROQ_API_KEY not configured' };
  }

  const fetcher = opts.fetcher ?? defaultFetcher;

  try {
    const response = await fetcher(apiKey, {
      model: getGroqModel(),
      messages,
      temperature: opts.temperature ?? 0.3,
      max_completion_tokens: opts.maxTokens ?? 900,
      response_format: opts.responseFormat ?? { type: 'json_object' },
    });

    if (!response.ok) {
      if (response.status === 429) {
        return {
          success: false,
          error: 'Groq rate limit reached — try again in a few minutes.',
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
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { success: false, error: 'Groq returned an empty response' };
    }

    return { success: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Groq request failed: ${message}` };
  }
}

export { GROQ_ENDPOINT, DEFAULT_GROQ_MODEL };
