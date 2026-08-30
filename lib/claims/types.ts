/** Epistemic status for a claim surfaced in UI, PDF, or LLM output. */
export type ClaimTag = 'verified' | 'verify' | 'conflict' | 'opinion';

export type ClaimSourceKind =
  | 'edgar'
  | 'scan'
  | 'dt'
  | 'short_check'
  | 'fast_verdict'
  | 'news'
  | 'model'
  | 'vendor';

export interface ClaimSource {
  kind: ClaimSourceKind;
  label?: string;
  url?: string;
  accessionNumber?: string;
  filingDate?: string;
}

/** Structured claim with explicit provenance — preferred in deterministic code paths. */
export interface TaggedClaim {
  text: string;
  tag?: ClaimTag;
  sources?: ClaimSource[];
  /** For CONFLICT — what the alternate source said. */
  conflictNote?: string;
}

export const CLAIM_TAG_LABELS: Record<ClaimTag, string> = {
  verified: 'Verified',
  verify: 'VERIFY',
  conflict: 'CONFLICT',
  opinion: 'OPINION',
};
