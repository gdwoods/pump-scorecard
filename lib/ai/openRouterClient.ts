import type { GroqResponseFormat } from './thesisJsonSchema';
import type { GroqCallResult, GroqChatMessage, GroqFetcher } from './groqClient';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'google/gemini-flash-latest';
const REQUEST_TIMEOUT_MS = 25_000;

export function getOpenRouterModel(): string {
  const fromEnv = process.env.OPENROUTER_MODEL?.trim();
  return fromEnv || DEFAULT_OPENROUTER_MODEL;
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

const defaultFetcher: GroqFetcher = (apiKey, body) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const referer =
    process.env.OPENROUTER_HTTP_REFERER?.trim() || 'https://short-check.vercel.app';
  const title = process.env.OPENROUTER_APP_TITLE?.trim() || 'Pump Scorecard';

  return fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': referer,
      'X-Title': title,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
};

/**
 * OpenRouter chat completions — OpenAI-compatible, used as Groq fallback on 429.
 */
export async function callOpenRouter(
  messages: GroqChatMessage[],
  opts: {
    fetcher?: GroqFetcher;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: GroqResponseFormat;
  } = {}
): Promise<GroqCallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return { success: false, error: 'OPENROUTER_API_KEY not configured' };
  }

  const fetcher = opts.fetcher ?? defaultFetcher;

  try {
    const body: Record<string, unknown> = {
      model: getOpenRouterModel(),
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1200,
    };
    if (opts.responseFormat) {
      body.response_format = opts.responseFormat;
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
              ? `OpenRouter rate limit — try again in about ${Math.ceil(retryAfterSec / 60)} minute(s).`
              : `OpenRouter rate limit — try again in ${retryAfterSec} seconds.`,
        };
      }
      const bodyText = await response.text().catch(() => '');
      return {
        success: false,
        error: `OpenRouter API error ${response.status}: ${bodyText.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { success: false, error: 'OpenRouter returned an empty response' };
    }

    return { success: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `OpenRouter request failed: ${message}` };
  }
}

export { OPENROUTER_ENDPOINT, DEFAULT_OPENROUTER_MODEL };
