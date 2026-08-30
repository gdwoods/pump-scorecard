// lib/ai/requestThesisGroq.ts

import { callGroq, type GroqChatMessage, type GroqCallResult } from './groqClient';
import { recordGroqApiCall } from './groqBudget';
import { getThesisResponseFormat } from './thesisJsonSchema';

const THESIS_MAX_TOKENS = 1600;

function isJsonValidateFailure(result: GroqCallResult): boolean {
  return result.errorCode === 'json_validate_failed';
}

function isRateLimited(result: GroqCallResult): boolean {
  return result.errorCode === 'rate_limit';
}

async function callGroqAndRecord(
  messages: GroqChatMessage[],
  opts: Parameters<typeof callGroq>[1]
): Promise<GroqCallResult> {
  const result = await callGroq(messages, opts);
  await recordGroqApiCall();
  return result;
}

/**
 * Request an AI thesis with Groq structured outputs.
 * Uses at most two Groq calls — never retries on rate limit (429).
 */
export async function requestThesisGroq(messages: GroqChatMessage[]): Promise<GroqCallResult> {
  const strict = await callGroqAndRecord(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: 0.2,
    responseFormat: getThesisResponseFormat(true),
  });
  if (strict.success || isRateLimited(strict) || !isJsonValidateFailure(strict)) {
    return strict;
  }

  return callGroqAndRecord(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: 0.15,
    responseFormat: getThesisResponseFormat(false),
  });
}
