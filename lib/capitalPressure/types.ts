/** Evidence-first Capital Pressure types. Undefined numerics mean unavailable, never zero. */

export type EvidenceStatus = 'reported' | 'partial' | 'unknown' | 'not_applicable';

export type CapitalEventType =
  | 'shelf_registration'
  | 'atm_program'
  | 'equity_line'
  | 'registered_direct'
  | 'convertible_note'
  | 'note_conversion'
  | 'debt_for_equity'
  | 'warrant_exercise'
  | 'prospectus_supplement'
  | 'reverse_split'
  | 'nasdaq_deficiency'
  | 'nasdaq_compliance';

export type CapitalPressureStatus = 'low' | 'watch' | 'elevated' | 'high';

export type SecEvidence = {
  form: string;
  accessionNumber?: string;
  filingDate: string;
  documentUrl: string;
  excerpt: string;
  confidence: 'high' | 'needs_review';
};

export type CapitalEvent = {
  id: string;
  eventDate: string;
  type: CapitalEventType;
  title: string;
  description: string;
  /** Capacity / registration / underlying potential — not confirmed issuance. */
  isCapacityOnly?: boolean;
  /**
   * When false, event appears on the timeline but awards no automatic score points
   * (e.g. retrospective reverse-split footnotes, selling-shareholder registrations).
   */
  scoreEligible?: boolean;
  /** Selling-shareholder / resale registration — not company ATM/ELOC capacity. */
  isSellingShareholder?: boolean;
  /** Retrospective accounting footnote rather than an effected split in-window. */
  isRetrospective?: boolean;
  grossProceedsUsd?: number;
  sharesIssued?: number;
  potentialShares?: number;
  filedAt?: string;
  verifiedAt?: string;
  evidence: SecEvidence;
};

export type ScoreReason = {
  label: string;
  points: number;
  evidence: SecEvidence;
};

export type CapacityField = {
  status: EvidenceStatus;
  description: string;
  potentialShares?: number;
  amountUsd?: number;
  evidence?: SecEvidence;
};

export type RecentIssuanceField = {
  status: EvidenceStatus;
  shares7d?: number;
  shares30d?: number;
  shares90d?: number;
  proceeds7dUsd?: number;
  proceeds30dUsd?: number;
  proceeds90dUsd?: number;
};

export type SharesOutstandingField = {
  status: EvidenceStatus;
  value?: number;
  asOf?: string;
  evidence?: SecEvidence;
};

export type CapitalPressureResult = {
  available: boolean;
  unavailableReason?: string;
  score: number;
  status: CapitalPressureStatus;
  dilutionLikelihood: number;
  shortExecutionRisk: number;
  summary: string;
  reasons: ScoreReason[];
  unknowns: string[];
  capacity: CapacityField;
  recentIssuance: RecentIssuanceField;
  sharesOutstanding: SharesOutstandingField;
  events: CapitalEvent[];
  scannedThrough: string;
  windowStart?: string;
  windowEnd?: string;
  /** Registration statements (S/F-1/3) may extend beyond the primary event window. */
  registrationWindowStart?: string;
  latestVerifiedAt?: string;
  /** Padded CIK when known — used for manual EDGAR links. */
  cik?: string;
  edgarSearchUrl?: string;
  /** Count of primary documents fetched/parsed in this run. */
  filingsScanned?: number;
  /** How many of the fixed score criteria had verified evidence (0–criteriaTotal). */
  criteriaVerified?: number;
  criteriaTotal?: number;
};

/** Parsed SEC fundamentals used by the scorer (XBRL or filing-derived). */
export type CapitalPressureFundamentals = {
  cashUsd?: number;
  cashAsOf?: string;
  operatingCashFlowUsd?: number;
  ocfAsOf?: string;
  currentAssetsUsd?: number;
  currentLiabilitiesUsd?: number;
  totalAssetsUsd?: number;
  balanceSheetAsOf?: string;
  sharesOutstanding?: number;
  sharesOutstandingAsOf?: string;
  sharesOutstandingEvidence?: SecEvidence;
  goingConcern?: {
    present: boolean;
    evidence?: SecEvidence;
  };
};

/** Inputs from the scan path that are not SEC-derived. */
export type CapitalPressureScanContext = {
  floatShares?: number | null;
  floatAsOf?: string | null;
  shortFloat?: number | null;
  borrowFee?: string | null;
  borrowAvailable?: string | null;
  news?: Array<{ title?: string; headline?: string; date?: string; publishedAt?: string }>;
  droppinessScore?: number | null;
  droppinessSpikeCount?: number | null;
  /** ISO timestamp used as "now" for recency windows (tests inject a fixed date). */
  asOf?: string;
};

export type ParsedCapitalPressure = {
  events: CapitalEvent[];
  fundamentals: CapitalPressureFundamentals;
  windowStart: string;
  windowEnd: string;
  scannedThrough: string;
  partial?: boolean;
  parseNotes?: string[];
};

export type FilingDocumentInput = {
  form: string;
  filingDate: string;
  accessionNumber?: string;
  documentUrl: string;
  /** Plain text (HTML already stripped) or raw HTML. */
  text: string;
  items?: string[];
};

export type XbrlSnapshot = {
  cashUsd?: number;
  cashAsOf?: string;
  operatingCashFlowUsd?: number;
  ocfAsOf?: string;
  currentAssetsUsd?: number;
  currentLiabilitiesUsd?: number;
  totalAssetsUsd?: number;
  balanceSheetAsOf?: string;
  sharesOutstanding?: number;
  sharesOutstandingAsOf?: string;
};
