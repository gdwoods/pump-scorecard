// lib/ai/groqClient.ts
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

export interface GroqChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface GroqCallResult {
  success: boolean;
  content?: string;
  error?: string;
}

/** Injectable so route/prompt logic can be verified without a live network call or API key. */
export type GroqFetcher = (apiKey: string, body: Record<string, unknown>) => Promise<Response>;

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const REQUEST_TIMEOUT_MS = 20_000;

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
  opts: { fetcher?: GroqFetcher; temperature?: number; maxTokens?: number } = {}
): Promise<GroqCallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'GROQ_API_KEY not configured' };
  }

  const fetcher = opts.fetcher ?? defaultFetcher;

  try {
    const response = await fetcher(apiKey, {
      model: GROQ_MODEL,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_completion_tokens: opts.maxTokens ?? 900,
      response_format: { type: 'json_object' },
    });

    if (!response.ok) {
      if (response.status === 429) {
        return {
          success: false,
          error: 'Groq free-tier rate limit reached for today — try again later.',
        };
      }
      const bodyText = await response.text().catch(() => '');
      return {
        success: false,
        error: `Groq API error ${response.status}: ${bodyText.slice(0, 200)}`,
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

export { GROQ_MODEL, GROQ_ENDPOINT };
