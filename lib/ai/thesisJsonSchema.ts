// lib/ai/thesisJsonSchema.ts
//
// Groq Structured Outputs schema for AI thesis responses.
// openai/gpt-oss-120b supports strict: true — avoids json_validate_failed from json_object mode.

export const THESIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    thesis: { type: 'string' },
    regulatoryAlert: { type: 'string' },
    rubricNarrative: { type: 'string' },
    ceoLens: { type: 'string' },
    traderLens: { type: 'string' },
    catalysts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          date: { type: 'string' },
          significance: { type: 'string', enum: ['high', 'moderate', 'low', 'stale'] },
          rationale: { type: 'string' },
        },
        required: ['description', 'date', 'significance', 'rationale'],
        additionalProperties: false,
      },
    },
    forwardDates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          event: { type: 'string' },
          significance: { type: 'string', enum: ['high', 'moderate', 'low', 'stale'] },
          tag: { type: 'string', enum: ['verify', 'conflict', 'opinion', 'none'] },
        },
        required: ['date', 'event', 'significance', 'tag'],
        additionalProperties: false,
      },
    },
    dataGaps: { type: 'array', items: { type: 'string' } },
    keyRisks: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'summary',
    'thesis',
    'regulatoryAlert',
    'rubricNarrative',
    'ceoLens',
    'traderLens',
    'catalysts',
    'forwardDates',
    'dataGaps',
    'keyRisks',
  ],
  additionalProperties: false,
} as const;

export type GroqResponseFormat =
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      json_schema: {
        name: string;
        strict: boolean;
        schema: typeof THESIS_JSON_SCHEMA;
      };
    };

export function getThesisResponseFormat(strict = true): GroqResponseFormat {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'ai_thesis',
      strict,
      schema: THESIS_JSON_SCHEMA,
    },
  };
}
