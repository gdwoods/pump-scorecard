import type { GroqResponseFormat } from './thesisJsonSchema';
import type { GroqCallResult, GroqChatMessage, GroqFetcher } from './groqClient';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-3.5-lightning:free';
const REQUEST_TIMEOUT_MS = 25_000;

/** Retired slugs that OpenRouter no longer routes — ignore env override. */
const DEPRECATED_OPENROUTER_MODELS = new Set([
  'google/gemini-2.0-flash-001',
  'google/gemini-flash-latest',
]);

const OPENROUTER_MODEL_FALLBACKS = [DEFAULT_OPENROUTER_MODEL] as const;

export function getOpenRouterModel(): string {
  return resolveOpenRouterModels()[0];
}

/** Preferred model first, then known-good fallbacks (deduped). */
export function resolveOpenRouterModels(): string[] {
  const preferred = process.env.OPENROUTER_MODEL?.trim();
  const models: string[] = [];
  if (preferred && !DEPRECATED_OPENROUTER_MODELS.has(preferred)) {
    models.push(preferred);
  }
  for (const model of OPENROUTER_MODEL_FALLBACKS) {
    if (!models.includes(model)) models.push(model);
  }
  return models;
}

function shouldTryNextOpenRouterModel(status: number, bodyText: string): boolean {
  if (status === 404 && bodyText.includes('No endpoints found')) return true;
  if (status === 400 && bodyText.includes('not a valid model ID')) return true;
  return false;
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
  const models = resolveOpenRouterModels();
  let lastResult: GroqCallResult = {
    success: false,
    error: 'OpenRouter request failed — no models to try',
  };

  try {
    for (const model of models) {
      const body: Record<string, unknown> = {
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 1200,
      };
      if (opts.responseFormat) {
        body.response_format = opts.responseFormat;
      }

      const response = await fetcher(apiKey, body);

      if (response.ok) {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
          lastResult = { success: false, error: 'OpenRouter returned an empty response' };
          continue;
        }
        return { success: true, content };
      }

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
      lastResult = {
        success: false,
        error: `OpenRouter API error ${response.status} (${model}): ${bodyText.slice(0, 200)}`,
      };
      if (shouldTryNextOpenRouterModel(response.status, bodyText)) {
        continue;
      }
      break;
    }

    return lastResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `OpenRouter request failed: ${message}` };
  }
}

export { OPENROUTER_ENDPOINT, DEFAULT_OPENROUTER_MODEL };
