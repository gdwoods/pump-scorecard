// scripts/smoke-openrouter-thesis.ts — live OpenRouter smoke test (requires OPENROUTER_API_KEY)
import { callOpenRouter, getOpenRouterModel } from '../lib/ai/openRouterClient';
import { requestThesisLlm } from '../lib/ai/requestThesisLlm';

async function main() {
  const hasKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  console.log('openrouter_configured:', hasKey);
  if (!hasKey) {
    console.error('Set OPENROUTER_API_KEY in .env.local or the environment.');
    process.exit(1);
  }

  const start = Date.now();
  const direct = await callOpenRouter(
    [
      {
        role: 'user',
        content:
          'Return JSON only: {"summary":"test","thesis":"test","catalysts":[],"keyRisks":[]}',
      },
    ],
    { maxTokens: 120, timeoutMs: 20_000 }
  );
  console.log(
    'direct_call:',
    JSON.stringify({
      success: direct.success,
      model: getOpenRouterModel(),
      ms: Date.now() - start,
      error: direct.error?.slice(0, 160),
      contentPreview: direct.content?.slice(0, 80),
    })
  );
  if (!direct.success) process.exit(1);

  const savedGroq = process.env.GROQ_API_KEY;
  process.env.AI_THESIS_OPENROUTER_FIRST = 'true';
  delete process.env.GROQ_API_KEY;

  const t0 = Date.now();
  const chain = await requestThesisLlm([
    { role: 'system', content: 'You output JSON only.' },
    {
      role: 'user',
      content: 'Return JSON: {"summary":"ok","thesis":"ok","catalysts":[],"keyRisks":[]}',
    },
  ]);
  console.log(
    'openrouter_first_chain:',
    JSON.stringify({
      success: chain.success,
      provider: chain.provider,
      model: chain.model,
      ms: Date.now() - t0,
      error: chain.error?.slice(0, 160),
    })
  );

  if (savedGroq) process.env.GROQ_API_KEY = savedGroq;
  else delete process.env.GROQ_API_KEY;

  if (!chain.success || chain.provider !== 'openrouter') {
    process.exit(1);
  }
  console.log('\nOpenRouter thesis path OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
