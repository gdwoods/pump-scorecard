// scripts/verify-legacy-risk-score.ts
import { computeLegacyWeightedRiskScore } from '../lib/scan/legacyWeightedRiskScore';

let failures = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

const none = computeLegacyWeightedRiskScore({
  suddenVolumeSpike: false,
  suddenPriceSpike: false,
  dilutionOffering: false,
  riskyCountry: false,
});
assert(none.weightedRiskScore === 0, 'no flags → score 0');
assert(none.summaryVerdict === 'Low risk', 'no flags → low risk');

const volOnly = computeLegacyWeightedRiskScore({
  suddenVolumeSpike: true,
  suddenPriceSpike: false,
  dilutionOffering: false,
  riskyCountry: false,
});
assert(volOnly.weightedRiskScore === 20, 'volume spike only → 20');

const all = computeLegacyWeightedRiskScore({
  suddenVolumeSpike: true,
  suddenPriceSpike: true,
  dilutionOffering: true,
  riskyCountry: true,
});
assert(all.weightedRiskScore === 75, 'all legacy flags → 75 (no fraud/droppiness)');
assert(all.summaryVerdict === 'High risk', '75 → high risk');

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nALL LEGACY RISK SCORE ASSERTIONS PASSED');
