// scripts/verify-claims.ts
//
// Verifies VERIFY / CONFLICT / OPINION tagging helpers without network.

import {
  claimTagInlinePrefix,
  formatTaggedClaimInline,
  normalizeTaggedClaims,
  parseInlineClaimTag,
} from '../lib/claims';
import type { TaggedClaim } from '../lib/claims/types';

let failures = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

assert(claimTagInlinePrefix('verify') === 'VERIFY: ', 'verify inline prefix');
assert(claimTagInlinePrefix('conflict') === 'CONFLICT: ', 'conflict inline prefix');
assert(claimTagInlinePrefix('opinion') === 'OPINION: ', 'opinion inline prefix');

const verifyParsed = parseInlineClaimTag('VERIFY: Borrow fee not in fact pack.');
assert(verifyParsed.tag === 'verify', 'parseInlineClaimTag detects VERIFY');
assert(verifyParsed.body === 'Borrow fee not in fact pack.', 'parseInlineClaimTag strips VERIFY prefix');

const conflictParsed = parseInlineClaimTag('CONFLICT: DT float vs scan float.');
assert(conflictParsed.tag === 'conflict', 'parseInlineClaimTag detects CONFLICT');

const opinionParsed = parseInlineClaimTag('OPINION: Rally into supply zone.');
assert(opinionParsed.tag === 'opinion', 'parseInlineClaimTag detects OPINION');

const plain = parseInlineClaimTag('Walk-away flag is binding.');
assert(plain.tag === 'verified', 'unprefixed text is verified');

const structured: TaggedClaim = {
  text: 'Active ATM draw',
  tag: 'verified',
  sources: [{ kind: 'edgar', accessionNumber: '0001', label: '10-Q' }],
};
assert(
  formatTaggedClaimInline(structured) === 'Active ATM draw',
  'verified claim formats without prefix'
);

const conflictClaim: TaggedClaim = {
  text: 'Float mismatch',
  tag: 'conflict',
  conflictNote: 'DT 8.87M vs scan 18.54M',
};
assert(
  formatTaggedClaimInline(conflictClaim).includes('CONFLICT:'),
  'conflict claim includes conflict note inline'
);

const normalized = normalizeTaggedClaims([
  'VERIFY: missing warrant table',
  { text: 'CP score high', tag: 'verified' },
  '',
  null,
]);
assert(normalized.length === 2, 'normalizeTaggedClaims drops empty items');
assert(normalized[0].tag === 'verify', 'normalizeTaggedClaims parses inline VERIFY from string');
assert(normalized[1].tag === 'verified', 'normalizeTaggedClaims keeps structured verified');

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('\nALL CLAIM TAGGING ASSERTIONS PASSED');
