import type { GroqResponseFormat } from './thesisJsonSchema';
import type { GroqCallResult, GroqChatMessage, GroqFetcher } from './groqClient';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
/** Fast free model (~0.8s P50). Prefer over Nemotron Lightning (~28s P50 free). */
const DEFAULT_OPENROUTER_MODEL = 'cohere/north-mini-code:free';
const OPENROUTER_FALLBACK_MODEL = 'nvidia/nemotron-3.5-lightning:free';
const REQUEST_TIMEOUT_MS = 16_000;

/** Retired slugs that OpenRouter no longer routes — ignore env override. */
const DEPRECATED_OPENROUTER_MODELS = new Set([
  'google/gemini-2.0-flash-001',
  'google/gemini-flash-latest',
]);

const OPENROUTER_MODEL_FALLBACKS = [DEFAULT_OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODEL] as const;

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
  if (status === 400 && /response_format|json_schema|json_object/i.test(bodyText)) return true;
  if (status === 429) return true;
  return false;
}

function extractOpenRouterContent(data: unknown): string | null {
  const message = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]
    ?.message;
  if (!message) return null;
  const { content } = message;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const p = part as { type?: string; text?: string };
        return p.type === 'text' && typeof p.text === 'string' ? p.text : '';
      })
      .join('')
      .trim();
    if (text) return text;
  }
  return null;
}

function createTimeoutFetcher(timeoutMs: number): GroqFetcher {
  return (_apiKey, body) =>
    fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${_apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer':
          process.env.OPENROUTER_HTTP_REFERER?.trim() || 'https://short-check.vercel.app',
        'X-Title': process.env.OPENROUTER_APP_TITLE?.trim() || 'Pump Scorecard',
      },
      body: JSON.stringify({ ...body, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

/**
 * OpenRouter chat completions — OpenAI-compatible.
 * Tries North Mini Code first, then Nemotron Lightning.
 */
export async function callOpenRouter(
  messages: GroqChatMessage[],
  opts: {
    fetcher?: GroqFetcher;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: GroqResponseFormat;
    timeoutMs?: number;
  } = {}
): Promise<GroqCallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return { success: false, error: 'OPENROUTER_API_KEY not configured' };
  }

  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const fetcher = opts.fetcher ?? createTimeoutFetcher(timeoutMs);
  const models = resolveOpenRouterModels();
  let lastResult: GroqCallResult = {
    success: false,
    error: 'OpenRouter request failed — no models to try',
  };

  const formatAttempts: Array<GroqResponseFormat | undefined> = opts.responseFormat
    ? [opts.responseFormat, undefined]
    : [undefined];

  for (const model of models) {
    for (const responseFormat of formatAttempts) {
      const body: Record<string, unknown> = {
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 1200,
      };
      if (responseFormat) {
        body.response_format = responseFormat;
      }

      try {
        const response = await fetcher(apiKey, body);

        if (response.ok) {
          const data = await response.json();
          const content = extractOpenRouterContent(data);
          if (!content) {
            lastResult = { success: false, error: `OpenRouter returned an empty response (${model})` };
            continue;
          }
          return { success: true, content };
        }

        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('retry-after');
          const retryAfterSec = retryAfterHeader
            ? Math.max(1, Number.parseInt(retryAfterHeader, 10) || 60)
            : 60;
          lastResult = {
            success: false,
            errorCode: 'rate_limit',
            retryAfterSec,
            error:
              retryAfterSec >= 60
                ? `OpenRouter rate limit — try again in about ${Math.ceil(retryAfterSec / 60)} minute(s).`
                : `OpenRouter rate limit — try again in ${retryAfterSec} seconds.`,
          };
          // Try next model on free-tier 429.
          break;
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
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const timedOut =
          error instanceof Error &&
          (error.name === 'AbortError' ||
            error.name === 'TimeoutError' ||
            /aborted|timeout/i.test(message));
        lastResult = {
          success: false,
          error: timedOut
            ? `OpenRouter request timed out after ${Math.round(timeoutMs / 1000)}s (${model})`
            : `OpenRouter request failed (${model}): ${message}`,
        };
        // Try next model on timeout/network error.
        break;
      }
    }
  }

  return lastResult;
}

export { OPENROUTER_ENDPOINT, DEFAULT_OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODEL };
