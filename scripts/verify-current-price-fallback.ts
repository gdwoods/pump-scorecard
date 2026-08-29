// scripts/verify-current-price-fallback.ts
import { applyCurrentPriceFallback } from '../lib/shortCheck/currentPriceFallback';
import type { ExtractedData } from '../lib/shortCheckTypes';

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

async function run() {
  // undefined + ticker → fallback fires
  const missing: ExtractedData = { ticker: 'DFNS', confidence: 0.9 };
  await applyCurrentPriceFallback(missing, async () => ({
    price: 12.19,
    source: 'yahoo-finance',
  }));
  assert(missing.currentPrice === 12.19, 'sets currentPrice from fallback');
  assert(missing.currentPriceSource === 'yahoo-finance', 'sets currentPriceSource');

  // price already present → skipped
  const present: ExtractedData = {
    ticker: 'DFNS',
    currentPrice: 6.49,
    confidence: 0.9,
  };
  await applyCurrentPriceFallback(present, async () => {
    throw new Error('should not fetch');
  });
  assert(present.currentPrice === 6.49, 'skips when price already set');
  assert(present.currentPriceSource === undefined, 'source unchanged when skipped');

  // Yahoo returns null → request data unchanged, no throw
  const nullPrice: ExtractedData = { ticker: 'DFNS', confidence: 0.9 };
  await applyCurrentPriceFallback(nullPrice, async () => ({
    price: null,
    source: 'yahoo-finance',
  }));
  assert(nullPrice.currentPrice === undefined, 'null quote leaves price unset');

  // fetch throws → no throw, price unset
  const throws: ExtractedData = { ticker: 'DFNS', confidence: 0.9 };
  await applyCurrentPriceFallback(throws, async () => {
    throw new Error('network down');
  });
  assert(throws.currentPrice === undefined, 'fetch error leaves price unset');
}

run()
  .then(() => {
    console.log(failed === 0 ? '\nALL CURRENT PRICE FALLBACK ASSERTIONS PASSED' : `\n${failed} FAILURES`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
