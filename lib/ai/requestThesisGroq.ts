// lib/ai/requestThesisGroq.ts

import { callGroq, type GroqChatMessage, type GroqCallResult } from './groqClient';
import { getThesisResponseFormat } from './thesisJsonSchema';

const THESIS_MAX_TOKENS = 1600;

function isJsonValidateFailure(result: GroqCallResult): boolean {
  return result.errorCode === 'json_validate_failed';
}

function isRateLimited(result: GroqCallResult): boolean {
  return result.errorCode === 'rate_limit';
}

/**
 * Request an AI thesis with Groq structured outputs.
 * Uses at most two Groq calls — never retries on rate limit (429).
 */
export async function requestThesisGroq(messages: GroqChatMessage[]): Promise<GroqCallResult> {
  const strict = await callGroq(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: 0.2,
    responseFormat: getThesisResponseFormat(true),
  });
  if (strict.success || isRateLimited(strict) || !isJsonValidateFailure(strict)) {
    return strict;
  }

  return callGroq(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: 0.15,
    responseFormat: getThesisResponseFormat(false),
  });
}
