// lib/ai/requestThesisGroq.ts

import { callGroq, type GroqChatMessage, type GroqCallResult } from './groqClient';
import { getThesisResponseFormat } from './thesisJsonSchema';

const THESIS_MAX_TOKENS = 2000;

function isJsonValidateFailure(result: GroqCallResult): boolean {
  return result.errorCode === 'json_validate_failed';
}

/**
 * Request an AI thesis with Groq structured outputs, falling back on validation failures.
 */
export async function requestThesisGroq(messages: GroqChatMessage[]): Promise<GroqCallResult> {
  const strict = await callGroq(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: 0.2,
    responseFormat: getThesisResponseFormat(true),
  });
  if (strict.success) return strict;
  if (!isJsonValidateFailure(strict)) return strict;

  const relaxed = await callGroq(messages, {
    maxTokens: THESIS_MAX_TOKENS,
    temperature: 0.15,
    responseFormat: getThesisResponseFormat(false),
  });
  if (relaxed.success) return relaxed;
  if (!isJsonValidateFailure(relaxed)) return relaxed;

  return callGroq(
    [
      {
        role: 'system',
        content: `${messages[0].content}\n\nCRITICAL: Respond with ONLY one valid JSON object. No markdown fences. No prose before or after.`,
      },
      messages[1],
    ],
    {
      maxTokens: THESIS_MAX_TOKENS,
      temperature: 0.1,
      responseFormat: { type: 'json_object' },
    }
  );
}
