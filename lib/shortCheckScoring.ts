// lib/shortCheckScoring.ts
import { ExtractedData } from './shortCheckTypes';
import { T } from './config/thresholds';
import { normalizeShareCount } from './normalizeShares';

export interface ScoreBreakdown {
  cashNeed: number;
  cashRunway: number;
  offeringAbility: number;
  historicalDilution: number;
  institutionalOwnership: number;
  shortInterest: number;
  newsCatalyst: number;
  float: number;
  overallRisk: number;
  priceSpike: number;
  debtToCash: number;
  droppiness: number;
  // Actual values for display
  actualValues?: {
    cashNeed?: string; // e.g., "$3.5M burn, 2.1 mo runway"
    cashRunway?: string; // e.g., "2.1 months"
    offeringAbility?: string; // e.g., "ATM Active"
    historicalDilution?: string; // e.g., "O/S: 50M, Float: 20M"
    institutionalOwnership?: string; // e.g., "45.2%"
    shortInterest?: string; // e.g., "25.5%"
    newsCatalyst?: string; // e.g., "Recent news found"
    float?: string; // e.g., "20.5M shares"
    overallRisk?: string; // e.g., "3 risk indicators"
    priceSpike?: string; // e.g., "20.51%" or "No spike"
    debtToCash?: string; // e.g., "Debt: $5M, Cash: $2M"
    droppiness?: string; // e.g., "75 (spikes fade quickly)"
  };
}

export type DroppinessStatus = 'OK' | 'UNVERIFIED' | 'MISSING';

export interface DroppinessInput {
  score?: number;
  spikeCount?: number;
}

export interface ShortCheckResult {
  rating: number; // 0-100 percentage
  category: 'High-Priority Short Candidate' | 'Moderate Short Candidate' | 'Speculative Short Candidate' | 'No-Trade';
  walkAwayFlags: string[];
  alertLabels: Array<{ label: string; color: 'red' | 'orange' | 'yellow' }>; // Visual alert chips
  scoreBreakdown: ScoreBreakdown;
  alertCard: string;
  /** Fraction of scoring components with real data (0–1). */
  dataCompleteness: number;
  droppinessStatus: DroppinessStatus;
  spikeCount: number | null;
}

type OfferingColor = 'Red' | 'Yellow' | 'Green';
type OverheadColor = 'Red' | 'Yellow' | 'Green';

/**
 * Determine Offering Ability color based on ATM/Shelf status
 * Red = Active dilution (ATM Active or active dilution via warrants/convertibles)
 * Yellow = S-1/Shelf filed but not yet active
 * Green = No active dilution mechanism
 * 
 * For NIVF: "S-1 Filed" with active dilution (warrants, convertibles, White Lion) = Red
 */
function getOfferingColor(atmShelfStatus: string | undefined, outstandingShares?: number, float?: number): OfferingColor {
  if (!atmShelfStatus) {
    // If no status but we have significant dilution (O/S >> Float), might be Red
    const os = normalizeShareCount(outstandingShares);
    const fl = normalizeShareCount(float);
    if (os && fl) {
      if (os / fl >= 1.5) {
        return 'Red'; // Infer active dilution from high O/S ratio
      }
    }
    return 'Green';
  }

  const status = atmShelfStatus.toLowerCase();

  // CRITICAL: Respect DT's explicit visual tags FIRST - these take absolute precedence
  // When DT says "Medium", it means Yellow (score +10), NOT Red (score +25)
  // Do NOT override DT tags based on dilution ratios or other heuristics
  if (status.startsWith('dt:')) {
    const dtTag = status.substring(3).trim(); // Extract tag after "dt:"
    if (process.env.NODE_ENV === 'development') {
      console.log('getOfferingColor: DT tag detected:', dtTag);
    }
    if (dtTag === 'red' || dtTag === 'high') {
      return 'Red'; // High = Red = +25 points (via matrix)
    }
    if (dtTag === 'medium' || dtTag === 'yellow') {
      // DT Medium = Yellow = +10 points (NOT Red = +25 points)
      return 'Yellow';
    }
    if (dtTag === 'green' || dtTag === 'low') {
      return 'Green'; // Low = Green
    }
    // If unrecognized DT tag, fall through to normal logic
  }

  // Check for active dilution indicators - these override S-1 status
  // Key patterns: Equity Line, Share Purchase Agreement, ATM Active, warrants, convertibles, White Lion
  // Note: Check for Equity Line FIRST since it's often combined with other text
  // For SCNX: "Equity Line" should trigger Red Offering
  if (status.includes('equity line') ||
    status.includes('share purchase agreement') ||
    status.includes('purchase agreement') ||
    status.includes('atm active') ||
    status.includes('active atm') ||
    status.includes('active dilution') ||
    status.includes('warrants') ||
    status.includes('convertibles') ||
    status.includes('white lion')) {
    return 'Red'; // Active dilution mechanism = Red (e.g., SCNX: Equity Line)
  }

  // If S-1 Filed AND we have significant dilution (O/S >> Float), treat as Red (active)
  // This handles cases where S-1 is filed and dilution is actively happening
  // BUT: Skip this check if we already have a DT tag (handled above)
  if ((status.includes('s-1') || status.includes('shelf')) && outstandingShares && float) {
    const os = normalizeShareCount(outstandingShares)!;
    const fl = normalizeShareCount(float)!;

    const dilutionRatio = os / fl;
    if (dilutionRatio >= 1.5) {
      return 'Red'; // S-1 Filed + significant dilution = active = Red
    }
    return 'Yellow'; // S-1 Filed but no significant dilution yet = Yellow
  }

  // S-1 or Shelf filed but not necessarily active
  if (status.includes('s-1') || status.includes('shelf')) {
    return 'Yellow';
  }

  return 'Green';
}

/**
 * Determine Overhead Supply color based on dilution indicators
 * 
 * For NIVF: O/S = 4.32M, Float = 2.94M
 * Dilution ratio = (4.32 - 2.94) / 2.94 = 0.47 = 47%
 * But with >300% O/S growth, overhead should be Red
 * 
 * Actually, if O/S grew from 1.05M to 4.32M, that's massive dilution.
 * For overhead, we check: (O/S - Float) / Float
 * If this ratio is high OR if O/S/Float ratio suggests significant dilution, it's Red
 */
function getOverheadColor(
  outstandingShares: number | undefined,
  float: number | undefined
): OverheadColor {
  const os = normalizeShareCount(outstandingShares);
  const fl = normalizeShareCount(float);
  if (!os || !fl) return 'Green';

  // Calculate dilution ratio: (O/S - Float) / Float
  const dilutionRatio = (os - fl) / fl;

  // Also check O/S to Float ratio - if O/S is much larger, significant dilution occurred
  const osToFloatRatio = os / fl;

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    const shouldBeRed = dilutionRatio > 1.0 || osToFloatRatio >= 1.2;
    console.log('Overhead Color Debug:', {
      rawOS: outstandingShares,
      rawFloat: float,
      convertedOS: os,
      convertedFloat: fl,
      dilutionRatio,
      osToFloatRatio,
      shouldBeRed,
      threshold: '1.2x',
    });
  }

  // Red if: dilution ratio > 1.0 (100%+) OR O/S is >=1.2x Float (suggesting major dilution)
  // For SCNX: O/S 34.47M vs Float 27.64M = 1.25x → Red (overhead supply)
  // For NIVF: O/S 4.32M vs Float 2.94M = 1.47x → Red
  // Lowered threshold from 1.3x to 1.2x to catch significant dilution cases
  if (dilutionRatio > 1.0 || osToFloatRatio >= 1.2) return 'Red';
  // Yellow if: dilution ratio > 0.3 (30%+) OR O/S is >1.1x Float
  if (dilutionRatio > 0.3 || osToFloatRatio >= 1.1) return 'Yellow';
  return 'Green';
}

/**
 * Calculate Cash Need score (0-25 points)
 * Based on runway: <6mo = High, 6-24mo = Moderate, >24mo or positive OCF = Low
 * 
 * IMPORTANT: Positive cash flow = LOW cash need = +5 points (not disqualifying for cash need)
 */
function scoreCashNeed(
  cashRunway: number | undefined,
  burnRate: number | undefined,
  cashOnHand: number | undefined,
  cashNeedStatus?: string | undefined
): number {
  // CRITICAL: If DT provides Cash Need status, use it directly
  if (cashNeedStatus && cashNeedStatus.toLowerCase().startsWith('dt:')) {
    const dtTag = cashNeedStatus.toLowerCase().substring(3).trim();
    console.log('Using DT Cash Need tag:', cashNeedStatus);
    if (dtTag === 'red' || dtTag === 'high') return 25; // High = +25
    if (dtTag === 'yellow' || dtTag === 'medium') return 18; // Medium = +18
    if (dtTag === 'green' || dtTag === 'low') return 5; // Low = +5
  }

  // If positive cash flow (burnRate >= 0), return Low score (+5)
  // This is NOT a walk-away for Cash Need - it just means low cash need = low score
  if (burnRate !== undefined && burnRate >= 0) {
    return 5; // Low cash need - positive cash flow means no immediate cash need
  }

  // Calculate runway from cash and burn rate if runway not provided
  // Note: burnRate should be in dollars (negative for burn, positive for cash flow)
  // If burnRate is -3.37M, it's -3,370,000 in raw dollars
  // cashOnHand should also be in dollars (e.g., 5,000,000 for $5M)
  let effectiveRunway = cashRunway;
  if (!effectiveRunway && cashOnHand && burnRate && burnRate < 0) {
    const quarterlyBurn = Math.abs(burnRate); // Make positive for calculation
    const monthlyBurn = quarterlyBurn / 3; // Convert quarterly to monthly
    if (monthlyBurn > 0 && cashOnHand > 0) {
      effectiveRunway = cashOnHand / monthlyBurn; // Months of cash remaining
    }
  }

  if (!effectiveRunway) return 0;

  if (effectiveRunway < 6) return 25; // High cash need
  if (effectiveRunway < 24) return 18; // Moderate cash need
  return 5; // Low cash need (>24 months)
}

/**
 * Calculate Cash Runway score (0-15 points, can be negative for walk-away)
 * 
 * IMPORTANT: When Cash Need is Green (Low), Cash Runway should be neutral-to-positive
 * since low cash need already accounts for the situation. A -10 penalty would be double-counting.
 */
function scoreCashRunway(
  runway: number | undefined,
  burnRate: number | undefined,
  cashNeedStatus?: string | undefined
): number {
  // CRITICAL: If Cash Need is Green (Low), Cash Runway should be neutral/positive
  // Green Cash Need means low cash need is already accounted for, so don't penalize runway
  if (cashNeedStatus && cashNeedStatus.toLowerCase() === 'dt:green') {
    console.log('Cash Need is Green (Low) - scoring Cash Runway as neutral/positive instead of penalty');
    // Return positive score based on runway length, but cap at moderate levels
    if (!runway) return 10; // Default neutral-positive
    if (runway < 6) return 12; // Short runway still risky (updated to +12 max for emergency)
    if (runway < 12) return 10; // Moderate risk
    if (runway < 24) return 3; // Neutral-positive
    return 1; // Long runway = neutral-positive (not penalty)
  }

  // If positive cash flow, return -10 (walk-away disqualification)
  if (burnRate !== undefined && burnRate >= 0) {
    return -10; // Walk-away for positive cash flow
  }

  if (!runway) return 0;

  if (runway < 0) return 15; // Negative runway
  if (runway < 4) return 12; // Emergency: 0-4 months -> +12
  if (runway < 12) return 10; // Critical: 4-12 months -> +10
  if (runway < 18) return 3; // Moderate: 12-18 months -> +3
  if (runway < 24) return 1; // Safe: 18-24 months -> +1
  // runway >= 24 is handled as walk-away flag but still contributes -10 to score
  return -10;
}

/**
 * Calculate Offering Ability & Overhead Supply score (-30 to +25 points)
 * Uses Red/Yellow/Green matrix
 */
function scoreOfferingAbility(
  atmShelfStatus: string | undefined,
  outstandingShares: number | undefined,
  float: number | undefined,
  overheadSupplyStatus?: string | undefined
): number {
  // CRITICAL: If DT provides explicit tags, respect them fully
  // DT:Red (High) = +25 points, DT:Medium = +10 points
  if (atmShelfStatus && atmShelfStatus.toLowerCase().startsWith('dt:')) {
    const dtTag = atmShelfStatus.toLowerCase().substring(3).trim();
    if (dtTag === 'red' || dtTag === 'high') {
      console.log('DT:Red/High tag detected for Offering Ability - using DT assessment: will calculate via matrix (Red)');
      // Continue to matrix calculation with Red offering
    } else if (dtTag === 'medium' || dtTag === 'yellow') {
      console.log('DT:Medium tag detected for Offering Ability - using DT assessment: +10 points (overriding matrix calculation)');
      return 10; // DT says Medium = +10 points total
    } else if (dtTag === 'green' || dtTag === 'low') {
      console.log('DT:Green/Low tag detected for Offering Ability - using DT assessment: will calculate via matrix (Green)');
      // Continue to matrix calculation with Green offering
    }
  }

  const offering = getOfferingColor(atmShelfStatus, outstandingShares, float);

  // If DT provides Overhead Supply tag, use it; otherwise calculate from O/S ratios
  let overhead: OverheadColor;
  if (overheadSupplyStatus && overheadSupplyStatus.toLowerCase().startsWith('dt:')) {
    const dtTag = overheadSupplyStatus.toLowerCase().substring(3).trim();
    if (dtTag === 'red' || dtTag === 'high') {
      overhead = 'Red';
    } else if (dtTag === 'yellow' || dtTag === 'medium') {
      overhead = 'Yellow';
    } else if (dtTag === 'green' || dtTag === 'low') {
      overhead = 'Green';
    } else {
      overhead = getOverheadColor(outstandingShares, float); // Fallback to calculation
    }
    console.log('Using DT Overhead Supply tag:', overheadSupplyStatus, '->', overhead);
  } else {
    overhead = getOverheadColor(outstandingShares, float);
  }

  // Debug logging - always log when DT tag is present
  if (atmShelfStatus && atmShelfStatus.toLowerCase().startsWith('dt:')) {
    console.log('Offering Ability Debug (DT tag present):', {
      atmShelfStatus,
      offering,
      overhead,
      expectedScore: offering === 'Red' && overhead === 'Red' ? 25 : offering === 'Red' && overhead === 'Green' ? 18 : offering === 'Yellow' && overhead === 'Red' ? 21 : offering === 'Yellow' && overhead === 'Yellow' ? 15 : offering === 'Yellow' && overhead === 'Green' ? 10 : 'other',
    });
  }

  // Debug logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('Offering Ability Debug:', {
      atmShelfStatus,
      outstandingShares,
      float,
      offering,
      overhead,
      expectedScore: offering === 'Red' && overhead === 'Red' ? 25 : offering === 'Red' && overhead === 'Green' ? 18 : 'other',
    });
  }

  // Matrix: Offering (rows) x Overhead (columns)
  const matrix: Record<OfferingColor, Record<OverheadColor, number>> = {
    Red: {
      Red: 25,
      Yellow: 22,
      Green: 18,
    },
    Yellow: {
      Red: 21,
      Yellow: 15,
      Green: 10,
    },
    Green: {
      Red: -5,
      Yellow: -20,
      Green: -30, // Walk-away
    },
  };

  return matrix[offering][overhead];
}

/**
 * Calculate Historical Dilution score (0-10 points)
 * Based on % increase in O/S over the past 3 years:
 * - +10 if O/S increased >100%
 * - +7 if increase is 30%-100%
 * - +3 if increase is <30%
 * 
 * If historical O/S data is unavailable, returns default score of 3.
 */
function scoreHistoricalDilution(
  outstandingShares: number | undefined,
  outstandingShares3YearsAgo: number | undefined,
  historicalDilutionStatus?: string | undefined
): number {
  // CRITICAL: If DT provides Historical Dilution status, use it directly
  if (historicalDilutionStatus && historicalDilutionStatus.toLowerCase().startsWith('dt:')) {
    const dtTag = historicalDilutionStatus.toLowerCase().substring(3).trim();
    console.log('Using DT Historical Dilution tag:', historicalDilutionStatus);
    if (dtTag === 'red' || dtTag === 'high') return 10; // High = +10
    if (dtTag === 'yellow' || dtTag === 'medium') return 7; // Medium = +7
    if (dtTag === 'green' || dtTag === 'low') return 3; // Low = +3
  }

  // If we don't have current O/S, can't calculate
  if (!outstandingShares) return 3; // Default moderate

  // Handle values that might be in millions vs raw numbers
  let currentOS = outstandingShares;
  if (currentOS < 1000) currentOS = currentOS * 1_000_000;

  // If we have historical O/S, calculate percentage increase
  if (outstandingShares3YearsAgo !== undefined && outstandingShares3YearsAgo !== null) {
    let historicalOS = outstandingShares3YearsAgo;
    if (historicalOS < 1000) historicalOS = historicalOS * 1_000_000;

    // If historical O/S is 0 or very small, treat as massive dilution
    if (historicalOS < 1000) {
      return 10; // Went from negligible to significant = >100% increase
    }

    // Calculate percentage increase
    const increasePct = (currentOS - historicalOS) / historicalOS;

    if (increasePct > 1.0) return 10; // >100% increase
    if (increasePct >= 0.3) return 7;  // 30%-100% increase
    return 3; // <30% increase
  }

  // No historical data available - return default
  return 3; // Default moderate (conservative when data unavailable)
}

/**
 * Calculate Institutional Ownership score (0-5 points, can be negative)
 * Default assumption for microcap/foreign stocks: <10% (Red) = +5
 * 
 * IMPORTANT: When ownership >25%, return 0 points (not +3) to match manual scoring
 * framework where high ownership (>20-25%) is considered bullish offset.
 */
function scoreInstitutionalOwnership(instOwn: number | undefined, _marketCap?: number): number {
  // Unavailable → 0 (never award the Red maximum for missing data)
  if (instOwn === undefined || instOwn === null) {
    return 0;
  }

  if (instOwn < 10) return 5;
  if (instOwn < 25) return 4;
  if (instOwn < 50) return 3; // 25% - 50%: +3
  if (instOwn <= T.instOwn.walkAway * 100) return -5;
  // Above walk-away threshold is a hard flag (handled separately)

  return -5;
}

/**
 * Calculate Short Interest score (0-15 points, can be negative)
 */
function scoreShortInterest(shortInt: number | undefined): number {
  // Unavailable → 0 (never award the default +8 for missing data)
  if (shortInt === undefined || shortInt === null) return 0;

  if (shortInt < 3) return 15;
  if (shortInt < 7) return 12;
  if (shortInt < 10) return 10;
  if (shortInt < 15) return 8;
  if (shortInt < 20) return 6;
  if (shortInt < 25) return 3;
  if (shortInt < 30) return 0;
  if (shortInt >= 30) return -5; // Warning only, not disqualifier

  return 0;
}

/**
 * Calculate News Catalyst score based on deterministic keyword matching
 * Rules (updated for API-based news):
 * - +0: Bullish terms (partnership, approval, contract, revenue growth, strategic) within 7 days
 * - +5: Neutral headline (earnings, launch, Q1-Q4, financials, presentation)
 * - +10: Dilution-linked filing (S-1, ATM, 424B, convertible)
 * - +15: No news found in last 10-14 days (default)
 * 
 * IMPORTANT: This function now expects a news headline string from API fetch,
 * not from OCR. If news is from OCR (old flow), it still works but will default to +15
 * since OCR typically doesn't capture news.
 */
function scoreNewsCatalyst(
  news: string | undefined,
  newsDate?: string,
  newsStatus?: ExtractedData['newsStatus']
): number {
  // Unavailable / failed fetch → 0 (never award +15 maximum for missing data)
  if (newsStatus === 'unavailable' || (newsStatus === undefined && (news === undefined || news === null))) {
    return 0;
  }

  // Explicitly confirmed no news = +15 (favorable for shorts)
  if (newsStatus === 'none' || !news || news.trim() === '' || news.toLowerCase().includes('none')) {
    return 15;
  }

  const lowerNews = news.toLowerCase().trim();

  // Check if news is recent (within 7 days for bullish penalty)
  const isRecent = newsDate ? (() => {
    const newsTime = new Date(newsDate).getTime();
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    return newsTime >= sevenDaysAgo;
  })() : true; // If no date, assume recent

  // +0: Strong bullish terms (within 7 days)
  // These are walk-away flags when recent
  if (isRecent) {
    const bullishKeywords = [
      'partnership',
      'approval',
      'fda approval',
      'contract',
      'major contract',
      'revenue growth',
      'strategic',
      'strategic partnership',
      'breakthrough',
      'acquisition',
      'merger',
      'deal',
      'profit',
      'earnings beat',
      'guidance raise',
      'positive',
      'expands',
    ];
    if (bullishKeywords.some(keyword => lowerNews.includes(keyword))) {
      return 0; // Recent bullish news = walk-away (score 0, will trigger flag)
    }
  }

  // +10: Dilution-linked filings (these are GOOD for shorts)
  const dilutionKeywords = [
    's-1',
    'atm',
    '424b',
    '424b5',
    '424(b)',
    'convertible',
    'convertible preferred',
    'warrants',
    'equity line',
    'share purchase agreement',
    'shelf offering',
    'public offering',
    'follow-on',
  ];
  if (dilutionKeywords.some(keyword => lowerNews.includes(keyword))) {
    return 10; // Dilution news = good for shorts
  }

  // +5: Neutral headlines (earnings, financials, presentations)
  const neutralKeywords = [
    'earnings',
    'launch',
    'q1',
    'q2',
    'q3',
    'q4',
    'quarter',
    'financials',
    'financial results',
    'presentation',
    'conference',
    'webcast',
    'announces',
  ];
  if (neutralKeywords.some(keyword => lowerNews.includes(keyword))) {
    return 5; // Neutral news
  }

  // Mechanical/share administrative updates score as "no news" (+15)
  const mechanicalKeywords = [
    'holders',
    'share count',
    'shares outstanding',
    'outstanding shares',
    'float',
    'shareholder',
    'filing',
    'form',
    'register',
    'delisted',
    'listed',
    'symbol',
    'ticker',
    'split',
    'reverse split',
    'dividend',
    'ex-dividend',
    'files 10-',
    'files 8-',
    'files form',
  ];
  if (mechanicalKeywords.some(keyword => lowerNews.includes(keyword))) {
    return 15; // Mechanical = no bullish catalyst
  }

  // Fluff/speculative news (old logic, kept for compatibility)
  const fluffKeywords = [
    'exploring',
    'considering',
    'potential',
    'could',
    'may',
    'rumor',
    'speculation',
  ];
  if (fluffKeywords.some(keyword => lowerNews.includes(keyword))) {
    return 10; // Fluff = moderate
  }

  // Default to +15 (no bullish catalyst) - conservative for short scoring
  return 15;
}

/**
 * Calculate Float score (0-10 points, adjusted for Green Offering)
 */
function scoreFloat(
  float: number | undefined,
  offeringColor: OfferingColor
): number {
  if (!float) return 0; // Unavailable — do not award default +5

  // IMPORTANT: Use float (public float), NOT outstandingShares or fully diluted shares
  const floatValue = normalizeShareCount(float);
  if (!floatValue) return 0;

  const isGreenOffering = offeringColor === 'Green';

  // Base scores based on actual float value.
  // Green-Offering penalty extends through the 5M band (Framework / START-HERE P1).
  if (floatValue < 500_000) {
    return isGreenOffering ? -10 : 10; // <500K
  }
  if (floatValue < 1_000_000) {
    return isGreenOffering ? -5 : 9; // 500K-1M
  }
  if (floatValue < 2_000_000) {
    return isGreenOffering ? -3 : 8; // 1M-2M
  }
  if (floatValue < 5_000_000) {
    return isGreenOffering ? -2 : 6; // 2M-5M
  }
  if (floatValue < 10_000_000) {
    return 4; // 5M-10M
  }
  if (floatValue < 20_000_000) {
    return 2; // 10M-20M
  }
  return 0; // >20M (large float)
}

/**
 * Calculate Overall Risk score (0-10 points)
 * High risk = +10, Moderate = +5, Low = +3
 */
function scoreOverallRisk(data: ExtractedData): number {
  // CRITICAL: If DT provides Overall Risk status, use it directly
  if (data.overallRiskStatus && data.overallRiskStatus.toLowerCase().startsWith('dt:')) {
    const dtTag = data.overallRiskStatus.toLowerCase().substring(3).trim();
    console.log('Using DT Overall Risk tag:', data.overallRiskStatus);
    if (dtTag === 'red' || dtTag === 'high') return 10; // High = +10
    if (dtTag === 'yellow' || dtTag === 'medium') return 5; // Medium = +5
    if (dtTag === 'green' || dtTag === 'low') return 3; // Low = +3
  }

  let riskIndicators = 0;

  // High risk indicators (each adds weight)
  // Cash runway <6 months
  if (data.cashRunway && data.cashRunway < 6) riskIndicators += 2;

  // Active dilution (ATM Active, warrants, convertibles, S-1 Filed with active dilution)
  if (data.atmShelfStatus) {
    const status = data.atmShelfStatus.toLowerCase();
    if (status.includes('active') ||
      status.includes('atm') ||
      status.includes('warrants') ||
      status.includes('convertibles') ||
      status.includes('white lion') ||
      status.includes('equity line') ||
      status.includes('share purchase agreement')) {
      riskIndicators += 2; // Active dilution = high risk
    } else if (status.includes('s-1') || status.includes('shelf')) {
      // S-1 Filed alone might not be active, but combined with other factors...
      riskIndicators += 1;
    }
  }

  // Significant dilution (O/S much larger than float)
  if (data.outstandingShares && data.float) {
    const os = normalizeShareCount(data.outstandingShares)!;
    const fl = normalizeShareCount(data.float)!;

    const dilutionRatio = os / fl;
    if (dilutionRatio >= 2.0) riskIndicators += 2; // >100% dilution = high risk
    else if (dilutionRatio > 1.2) riskIndicators += 1; // >20% dilution (e.g., SCNX: 1.25x, NIVF: 1.47x)
  }

  // Low institutional ownership (ultra-low is high risk)
  if (data.institutionalOwnership !== undefined && data.institutionalOwnership < 1) {
    riskIndicators += 2; // Ultra-low institutional ownership = high risk (e.g., SCNX: 0.3%)
  } else if (data.institutionalOwnership !== undefined && data.institutionalOwnership < 5) {
    riskIndicators += 1; // Low institutional ownership = moderate risk
  }

  // High debt relative to cash
  if (data.debt && data.cashOnHand && data.debt > data.cashOnHand * 2) {
    riskIndicators += 1;
  }

  // Microcap (high risk by default, especially if combined with dilution)
  if (data.marketCap && data.marketCap < 50_000_000) {
    riskIndicators += 1;
  }

  // If we have multiple high-risk factors (microcap + active dilution + significant dilution),
  // that's definitely high risk
  // Example: SCNX has S-1 Shelf (1) + Significant dilution 1.25x (1) + Microcap (1) + Ultra-low Inst Own 0.3% (2) = 5 indicators = +10
  // Example: NIVF has microcap + S-1 Filed + warrants/convertibles + 4.32M O/S vs 2.94M float
  if (riskIndicators >= 5) return 10; // High risk (multiple factors, e.g., SCNX)
  if (riskIndicators >= 3) return 7; // Moderate-high risk
  if (riskIndicators >= 2) return 5; // Moderate risk
  return 3; // Low risk
}

/**
 * Calculate Recent Price Spike score (0-10 points)
 * Uses percentage from DT screenshot if available (extracted from green price cards),
 * otherwise falls back to boolean indicator from OCR keyword detection.
 * 
 * Scoring brackets (updated to match manual scoring framework):
 * - >= 20%: 10 points (common DT spike threshold)
 * - < 20%: 0 points
 * 
 * Note: Previously required >=30% for any points, but manual scoring awards +10 for >=20%
 */
function scorePriceSpike(hasSpike: boolean | undefined, spikePct?: number): number {
  // If we have percentage from DT screenshot, use exact brackets
  if (spikePct !== undefined) {
    if (spikePct > 100) return 10; // > 100%: +10
    if (spikePct >= 50) return 8;  // 50% - 100%: +8
    if (spikePct >= 30) return 5;  // 30% - 50%: +5
    return 0; // < 30%: 0
  }

  // Fallback: if hasSpike boolean is true, assume moderate spike (30-50%)
  if (hasSpike) return 5;

  return 0;
}

/**
 * Calculate Debt-to-Cash Ratio score (0-10 points)
 * 
 * IMPORTANT: DT screenshots typically show "Net Cash" (Cash - Debt), not separate debt/cash values.
 * Without explicit debt data, we default to 0 points since we can't calculate the ratio accurately.
 */
function scoreDebtToCash(debt: number | undefined, cash: number | undefined, hasActualDebtData?: boolean): number {
  // If we don't have actual debt data (e.g., only have Net Cash from DT), default to 0
  if (hasActualDebtData === false) {
    return 0; // Can't calculate ratio without explicit debt data
  }

  if (!debt || !cash || cash === 0) {
    // Debt-free or no cash
    return 0;
  }

  // Debt Free check (if debt is 0 explicitly)
  if (debt === 0) return 0;

  const ratio = debt / cash;

  if (ratio > 2) return 10;
  if (ratio >= 1) return 7; // Debt 1x-2x Cash
  if (ratio < 1) return 4; // Debt < Cash (but not 0)

  return 0;
}

/**
 * High droppiness (70+) = spikes fade quickly = favorable for shorting (+12)
 * Low droppiness (<walkAway) = spikes hold = risky; walk-away when sample is valid
 * Fewer than minSpikes ⇒ UNVERIFIED — contributes 0, never a false-neutral
 */
function scoreDroppiness(
  droppinessScore: number | undefined,
  status: DroppinessStatus
): number {
  if (status !== 'OK' || droppinessScore === undefined || droppinessScore === null) {
    return 0;
  }

  if (droppinessScore >= T.droppiness.strong) {
    return 12;
  }
  if (droppinessScore >= 50) {
    return 5;
  }
  if (droppinessScore >= T.droppiness.walkAway) {
    return 0;
  }
  return -8;
}

function resolveDroppinessStatus(
  droppinessScore: number | undefined,
  spikeCount: number | undefined
): DroppinessStatus {
  if (droppinessScore === undefined || droppinessScore === null) {
    return 'MISSING';
  }
  if (spikeCount === undefined || spikeCount < T.droppiness.minSpikes) {
    return 'UNVERIFIED';
  }
  return 'OK';
}

/**
 * Check for walk-away disqualifiers (Framework 3.0 — thresholds from T)
 */
function checkWalkAwayFlags(
  data: ExtractedData,
  opts: {
    droppinessScore?: number;
    droppinessStatus: DroppinessStatus;
    spikeCount: number | null;
    offeringColor: OfferingColor;
  }
): string[] {
  const flags: string[] = [];

  // V1 — Droppiness failure (valid sample only)
  if (
    opts.droppinessStatus === 'OK' &&
    opts.droppinessScore !== undefined &&
    opts.droppinessScore < T.droppiness.walkAway &&
    (opts.spikeCount ?? 0) >= T.droppiness.minSpikes
  ) {
    flags.push(`Droppiness below ${T.droppiness.walkAway} with ${opts.spikeCount} spikes (spikes hold)`);
  }

  // Borrow unavailable (availability only — fee is not scored)
  if (T.borrow.requireAvailable && data.borrowAvailable === false) {
    flags.push('Borrow unavailable');
  }

  if (data.cashRunway && data.cashRunway > T.runway.walkAway) {
    flags.push(`Cash runway > ${T.runway.walkAway} months`);
  }

  if (data.quarterlyBurnRate && data.quarterlyBurnRate >= 0) {
    flags.push('Positive cash flow');
  }

  if (data.institutionalOwnership !== undefined && data.institutionalOwnership > T.instOwn.walkAway * 100) {
    flags.push(`Institutional ownership > ${T.instOwn.walkAway * 100}%`);
  }

  if (data.recentNews && data.recentNewsDate) {
    const lowerNews = data.recentNews.toLowerCase();
    const newsTime = new Date(data.recentNewsDate).getTime();
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    if (newsTime >= sevenDaysAgo) {
      const bullishKeywords = [
        'partnership', 'approval', 'fda approval', 'contract', 'major contract',
        'revenue growth', 'strategic', 'strategic partnership', 'breakthrough',
        'acquisition', 'merger', 'deal', 'profit', 'earnings beat',
        'guidance raise', 'positive', 'expands',
      ];
      if (bullishKeywords.some(keyword => lowerNews.includes(keyword))) {
        flags.push('Strong positive news catalyst detected (recent)');
      }
    }
  }

  if (data.marketCap && data.marketCap > T.marketCap.max) {
    flags.push(`Market Cap > $${T.marketCap.max / 1e6}M (Auto Pass)`);
  }

  const offeringTag = (data.atmShelfStatus || '').toLowerCase().startsWith('dt:')
    ? (data.atmShelfStatus || '').toLowerCase().substring(3).trim()
    : undefined;
  const overheadTag = (data.overheadSupplyStatus || '').toLowerCase().startsWith('dt:')
    ? (data.overheadSupplyStatus || '').toLowerCase().substring(3).trim()
    : undefined;

  const offeringColor = offeringTag
    ? (offeringTag === 'green' || offeringTag === 'low' ? 'Green' : 'Red')
    : getOfferingColor(data.atmShelfStatus, data.outstandingShares, data.float);
  const overheadColor = overheadTag
    ? (overheadTag === 'green' || overheadTag === 'low' ? 'Green' : 'Red')
    : getOverheadColor(data.outstandingShares, data.float);

  if (offeringColor === 'Green' && overheadColor === 'Green') {
    const status = (data.atmShelfStatus || '').toLowerCase();
    const hasRegulatoryOverride = (status.includes('s-1') || status.includes('s-3') || status.includes('f-3') || status.includes('atm')) &&
      status.includes('active');
    if (!hasRegulatoryOverride) {
      flags.push('Double Green Trap (Offering Green + Supply Green)');
    }
  }

  // V5 — Squeeze geometry: thin float + weak offering ability
  const floatShares = normalizeShareCount(data.float);
  if (
    floatShares !== undefined &&
    floatShares < T.float.squeezeFloor &&
    opts.offeringColor === 'Green'
  ) {
    flags.push('TRAP_RISK: thin float with Green offering ability (squeeze geometry)');
  }

  return flags;
}

/**
 * Calculate alert labels based on risk indicators
 * Returns visual chips to display next to the rating
 */
function calculateAlertLabels(data: ExtractedData, breakdown: ScoreBreakdown): Array<{ label: string; color: 'red' | 'orange' | 'yellow' }> {
  const alerts: Array<{ label: string; color: 'red' | 'orange' | 'yellow' }> = [];

  // 🔴 "Cash Raise Likely" - Runway < 2mo AND burn > $1M
  if (data.cashRunway !== undefined && data.cashRunway < 2) {
    let burnDollars = data.quarterlyBurnRate;
    if (burnDollars !== undefined && burnDollars < 0) {
      // Convert to absolute dollars
      burnDollars = Math.abs(burnDollars);
      if (burnDollars < 1000) burnDollars = burnDollars * 1_000_000; // Convert millions to dollars
      if (burnDollars > 1_000_000) {
        alerts.push({ label: 'Cash Raise Likely', color: 'red' });
      }
    }
  }

  // ⚠️ "Low Float Risk" - Float < 3M
  if (data.float !== undefined) {
    const floatShares = normalizeShareCount(data.float);
    if (floatShares !== undefined && floatShares < 3_000_000) {
      alerts.push({ label: 'Low Float Risk', color: 'orange' });
    }
  }

  // 🟠 "Max Dilution Tools" - ATM + S-1 + Convertibles all present
  if (data.atmShelfStatus) {
    const status = data.atmShelfStatus.toLowerCase();
    const hasATM = status.includes('atm') || status.includes('at-the-market');
    const hasS1 = status.includes('s-1') || status.includes('shelf');
    const hasConvertibles = status.includes('convertible') || status.includes('warrants') || status.includes('equity line');

    // Count distinct dilution mechanisms
    let mechanismCount = 0;
    if (hasATM) mechanismCount++;
    if (hasS1) mechanismCount++;
    if (hasConvertibles) mechanismCount++;

    if (mechanismCount >= 3) {
      alerts.push({ label: 'Max Dilution Tools', color: 'orange' });
    } else if (mechanismCount >= 2 && (hasATM && hasS1)) {
      // ATM + S-1 is particularly risky combination
      alerts.push({ label: 'Max Dilution Tools', color: 'orange' });
    }
  }

  return alerts;
}

/**
 * Determine category based on rating
 */
function getCategory(rating: number): ShortCheckResult['category'] {
  if (rating >= 70) return 'High-Priority Short Candidate';
  if (rating >= 40) return 'Moderate Short Candidate';
  if (rating >= 20) return 'Speculative Short Candidate';
  return 'No-Trade';
}

/**
 * Generate alert card text
 */
function generateAlertCard(
  ticker: string | undefined,
  result: ShortCheckResult,
  data: ExtractedData
): string {
  const tickerStr = ticker || 'N/A';
  const rating = result.rating.toFixed(1);
  const category = result.category;

  let card = `${tickerStr} is a ${category} with a rating of ${rating}%.\n\n`;

  // Add key metrics
  if (data.cashRunway !== undefined) {
    if (data.cashRunway < 0) {
      card += `Cash Runway: -${Math.abs(data.cashRunway).toFixed(1)} months (negative cash). `;
    } else {
      card += `Cash Runway: ${data.cashRunway.toFixed(1)} months. `;
    }
  }
  if (data.cashOnHand) {
    card += `Cash on hand: $${(data.cashOnHand / 1_000_000).toFixed(1)}M. `;
  }
  if (data.quarterlyBurnRate !== undefined) {
    card += `Quarterly burn: $${Math.abs(data.quarterlyBurnRate / 1_000_000).toFixed(2)}M. `;
  }

  if (data.atmShelfStatus) {
    card += `Dilution tools: ${data.atmShelfStatus}. `;
  }

  if (data.shortInterest !== undefined) {
    card += `Short interest: ${data.shortInterest.toFixed(1)}%. `;
  }

  if (data.float) {
    card += `Float: ${(data.float / 1_000_000).toFixed(2)}M. `;
  }

  if (data.institutionalOwnership !== undefined) {
    card += `Institutional ownership: ${data.institutionalOwnership.toFixed(1)}%. `;
  }

  if (data.marketCap) {
    card += `Market cap: $${(data.marketCap / 1_000_000).toFixed(1)}M. `;
  }

  if (result.walkAwayFlags.length > 0) {
    card += `\n\n⚠️ Walk-away flags: ${result.walkAwayFlags.join(', ')}`;
  }

  // Add top scoring factors (including droppiness)
  const breakdown = result.scoreBreakdown;
  const factors: [string, number][] = [
    ['Droppiness', breakdown.droppiness],
    ['Overall Risk', breakdown.overallRisk],
    ['Cash Need', breakdown.cashNeed],
    ['Offering Ability', breakdown.offeringAbility],
    ['Cash Runway', breakdown.cashRunway],
    ['Short Interest', breakdown.shortInterest],
    ['Historical Dilution', breakdown.historicalDilution],
    ['News Catalyst', breakdown.newsCatalyst],
    ['Float', breakdown.float],
    ['Price Spike', breakdown.priceSpike],
    ['Debt/Cash Ratio', breakdown.debtToCash],
    ['Institutional Ownership', breakdown.institutionalOwnership],
  ];

  // Sort by absolute value to catch both positive and negative contributions
  factors.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const topFactors = factors.slice(0, 5).filter(f => Math.abs(f[1]) > 0);

  if (topFactors.length > 0) {
    card += `\n\nTop scoring factors: ${topFactors.map(f => `${f[0]} (${f[1] >= 0 ? '+' : ''}${f[1].toFixed(1)})`).join(', ')}`;
  }

  return card;
}

/**
 * Main scoring function
 * @param data - Extracted data from OCR or manual entry
 * @param droppiness - Optional droppiness score (number) or { score, spikeCount }
 */
export function calculateShortRating(
  data: ExtractedData,
  droppiness?: number | DroppinessInput
): ShortCheckResult {
  const droppinessScore = typeof droppiness === 'number' ? droppiness : droppiness?.score;
  const spikeCountRaw = typeof droppiness === 'object' && droppiness ? droppiness.spikeCount : undefined;
  const spikeCount = spikeCountRaw === undefined ? null : spikeCountRaw;
  const droppinessStatus = resolveDroppinessStatus(droppinessScore, spikeCountRaw);

  // Determine offering color for float adjustment (pass O/S and float for better detection)
  const offeringColor = getOfferingColor(data.atmShelfStatus, data.outstandingShares, data.float);

  // Calculate runway from cash and burn rate if not provided
  let effectiveRunway = data.cashRunway;
  if (!effectiveRunway && data.cashOnHand && data.quarterlyBurnRate && data.quarterlyBurnRate < 0) {
    let quarterlyBurn = Math.abs(data.quarterlyBurnRate);
    if (quarterlyBurn < 1000) {
      quarterlyBurn = quarterlyBurn * 1_000_000;
    }
    let cash = data.cashOnHand;
    if (cash < 1000) {
      cash = cash * 1_000_000;
    }

    const monthlyBurn = quarterlyBurn / 3;
    if (monthlyBurn > 0 && cash > 0) {
      effectiveRunway = cash / monthlyBurn;
    }
  }

  const formatDollars = (value: number | undefined): string | undefined => {
    if (value === undefined || value === null) return undefined;
    let amount = value;
    if (Math.abs(amount) < 1000) {
      amount = amount * 1_000_000;
    }
    if (Math.abs(amount) >= 1_000_000) {
      return `$${(amount / 1_000_000).toFixed(1)}M`;
    } else if (Math.abs(amount) >= 1_000) {
      return `$${(amount / 1_000).toFixed(0)}K`;
    }
    return `$${amount.toFixed(0)}`;
  };

  const formatShares = (value: number | undefined): string | undefined => {
    const shares = normalizeShareCount(value);
    if (shares === undefined) return undefined;
    if (shares >= 1_000_000) {
      return `${(shares / 1_000_000).toFixed(1)}M shares`;
    } else if (shares >= 1_000) {
      return `${(shares / 1_000).toFixed(0)}K shares`;
    }
    return `${shares.toFixed(0)} shares`;
  };

  const droppinessPoints = scoreDroppiness(droppinessScore, droppinessStatus);

  const breakdown: ScoreBreakdown = {
    cashNeed: scoreCashNeed(effectiveRunway, data.quarterlyBurnRate, data.cashOnHand, data.cashNeedStatus),
    cashRunway: scoreCashRunway(effectiveRunway, data.quarterlyBurnRate, data.cashNeedStatus),
    offeringAbility: scoreOfferingAbility(
      data.atmShelfStatus,
      data.outstandingShares,
      data.float,
      data.overheadSupplyStatus
    ),
    historicalDilution: scoreHistoricalDilution(
      data.outstandingShares,
      data.outstandingShares3YearsAgo,
      data.historicalDilutionStatus
    ),
    institutionalOwnership: scoreInstitutionalOwnership(data.institutionalOwnership, data.marketCap),
    shortInterest: scoreShortInterest(data.shortInterest),
    newsCatalyst: scoreNewsCatalyst(data.recentNews, data.recentNewsDate, data.newsStatus),
    float: scoreFloat(data.float, offeringColor),
    overallRisk: scoreOverallRisk(data),
    priceSpike: scorePriceSpike(data.priceSpike, data.priceSpikePct),
    debtToCash: scoreDebtToCash(data.debt, data.cashOnHand, data.hasActualDebtData),
    droppiness: droppinessPoints,
    actualValues: {
      cashNeed: (() => {
        const parts: string[] = [];
        if (data.quarterlyBurnRate !== undefined && data.quarterlyBurnRate < 0) {
          parts.push(`${formatDollars(Math.abs(data.quarterlyBurnRate))} burn`);
        }
        if (effectiveRunway !== undefined) {
          parts.push(`${effectiveRunway.toFixed(1)} mo runway`);
        }
        return parts.length > 0 ? parts.join(', ') : undefined;
      })(),
      cashRunway: effectiveRunway !== undefined
        ? effectiveRunway < 0
          ? `-${Math.abs(effectiveRunway).toFixed(1)} months (negative cash)`
          : `${effectiveRunway.toFixed(1)} months`
        : undefined,
      offeringAbility: data.atmShelfStatus || undefined,
      historicalDilution: (() => {
        const parts: string[] = [];
        if (data.outstandingShares !== undefined) {
          parts.push(`Current O/S: ${formatShares(data.outstandingShares)?.replace(' shares', '')}`);
        }
        if (data.outstandingShares3YearsAgo !== undefined && data.outstandingShares3YearsAgo !== null) {
          parts.push(`O/S 3y ago: ${formatShares(data.outstandingShares3YearsAgo)?.replace(' shares', '')}`);
          const currentOS = normalizeShareCount(data.outstandingShares) ?? 0;
          const historicalOS = normalizeShareCount(data.outstandingShares3YearsAgo) ?? 0;
          if (historicalOS > 0) {
            const increasePct = ((currentOS - historicalOS) / historicalOS) * 100;
            parts.push(`(${increasePct > 0 ? '+' : ''}${increasePct.toFixed(0)}% increase)`);
          }
          const sourceNote = data.historicalOSSource === 'sec' ? ' (SEC)' : data.historicalOSSource === 'yahoo-finance' ? ' (Yahoo)' : '';
          if (sourceNote) parts.push(sourceNote);
        } else {
          parts.push('(historical data unavailable)');
        }
        return parts.length > 0 ? parts.join(' ') : undefined;
      })(),
      institutionalOwnership: data.institutionalOwnership !== undefined ? `${data.institutionalOwnership.toFixed(1)}%` : undefined,
      shortInterest: data.shortInterest !== undefined ? `${data.shortInterest.toFixed(1)}%` : undefined,
      newsCatalyst: data.recentNews && data.recentNews.toLowerCase() !== 'none'
        ? data.recentNews.length > 80
          ? `${data.recentNews.substring(0, 80)}...`
          : data.recentNews
        : data.newsStatus === 'none'
          ? 'No recent news'
          : data.newsStatus === 'unavailable'
            ? 'News unavailable'
            : undefined,
      float: data.float !== undefined ? formatShares(data.float) : undefined,
      overallRisk: (() => {
        const indicators: string[] = [];
        if (data.cashOnHand && data.quarterlyBurnRate && data.quarterlyBurnRate < 0) {
          const burn = Math.abs(data.quarterlyBurnRate);
          const burnAdjusted = burn < 1000 ? burn * 1_000_000 : burn;
          const cash = data.cashOnHand < 1000 ? data.cashOnHand * 1_000_000 : data.cashOnHand;
          if (cash / burnAdjusted < 3) indicators.push('Low cash');
        }
        if (data.atmShelfStatus && (data.atmShelfStatus.includes('Active') || data.atmShelfStatus.includes('active'))) {
          indicators.push('Active dilution');
        }
        if (data.shortInterest !== undefined && data.shortInterest > 20) {
          indicators.push('High short interest');
        }
        return indicators.length > 0 ? `${indicators.length} risk indicators` : undefined;
      })(),
      priceSpike: data.priceSpikePct !== undefined ? `${data.priceSpikePct.toFixed(2)}%` : (data.priceSpike ? 'Spike detected' : undefined),
      debtToCash: (() => {
        if (data.hasActualDebtData === false) {
          return 'Debt data unavailable (DT shows Net Cash only)';
        }
        const parts: string[] = [];
        if (data.debt !== undefined) {
          parts.push(`Debt: ${formatDollars(data.debt)}`);
        }
        if (data.cashOnHand !== undefined) {
          parts.push(`Cash: ${formatDollars(data.cashOnHand)}`);
        }
        const sourceNote = data.debtCashSource === 'yahoo-finance' ? ' (Yahoo Finance)' : '';
        return parts.length > 0 ? parts.join(', ') + sourceNote : undefined;
      })(),
      droppiness: (() => {
        if (droppinessStatus === 'MISSING') return undefined;
        if (droppinessStatus === 'UNVERIFIED') {
          const scorePart = droppinessScore !== undefined ? `${droppinessScore.toFixed(0)} ` : '';
          return `${scorePart}UNVERIFIED (<${T.droppiness.minSpikes} spikes)`;
        }
        if (droppinessScore === undefined) return undefined;
        if (droppinessScore >= T.droppiness.strong) return `${droppinessScore.toFixed(0)} (spikes fade quickly)`;
        if (droppinessScore >= 50) return `${droppinessScore.toFixed(0)} (spikes usually fade)`;
        if (droppinessScore >= T.droppiness.walkAway) return `${droppinessScore.toFixed(0)} (mixed behavior)`;
        return `${droppinessScore.toFixed(0)} (spikes hold)`;
      })(),
    },
  };

  const totalScore = breakdown.cashNeed + breakdown.cashRunway + breakdown.offeringAbility +
    breakdown.historicalDilution + breakdown.institutionalOwnership + breakdown.shortInterest +
    breakdown.newsCatalyst + breakdown.float + breakdown.overallRisk + breakdown.priceSpike +
    breakdown.debtToCash + breakdown.droppiness;

  // Denominator includes droppiness max (+12) when droppiness input is present so rating cannot exceed 100%.
  const maxPossibleScore = droppinessScore !== undefined ? 162 : 150;

  // Data completeness across 12 scoring components
  const populatedFlags = [
    effectiveRunway !== undefined || (data.cashOnHand !== undefined && data.quarterlyBurnRate !== undefined), // cashNeed/runway
    data.atmShelfStatus !== undefined || (data.outstandingShares !== undefined && data.float !== undefined), // offering
    data.outstandingShares3YearsAgo !== undefined || data.historicalDilutionStatus !== undefined, // historical
    data.institutionalOwnership !== undefined, // IO
    data.shortInterest !== undefined, // SI
    data.newsStatus === 'found' || data.newsStatus === 'none' || (data.recentNews !== undefined && data.newsStatus !== 'unavailable'), // news
    data.float !== undefined, // float
    true, // overallRisk always derived from available inputs
    data.priceSpikePct !== undefined || data.priceSpike !== undefined, // spike
    data.hasActualDebtData === true && data.debt !== undefined, // debt
    droppinessStatus === 'OK', // droppiness verified
    data.borrowAvailable !== undefined && data.borrowAvailable !== null, // borrow
  ];
  const populatedCount = populatedFlags.filter(Boolean).length;
  const dataCompleteness = populatedCount / populatedFlags.length;

  let rating = (totalScore / maxPossibleScore) * 100;
  rating = Math.min(100, Math.max(0, rating));
  rating = rating * dataCompleteness;

  const walkAwayFlags = checkWalkAwayFlags(data, {
    droppinessScore,
    droppinessStatus,
    spikeCount,
    offeringColor,
  });

  if (dataCompleteness < T.dataQuality.minCompleteness) {
    walkAwayFlags.push(
      `Data completeness ${(dataCompleteness * 100).toFixed(0)}% below ${(T.dataQuality.minCompleteness * 100).toFixed(0)}%`
    );
  }

  let category: ShortCheckResult['category'];

  if (walkAwayFlags.length > 0) {
    category = 'No-Trade';
  } else if (rating > T.category.highPriority) {
    category = 'High-Priority Short Candidate';
  } else if (rating >= T.category.moderate) {
    category = 'Moderate Short Candidate';
  } else if (rating >= T.category.speculative) {
    category = 'Speculative Short Candidate';
  } else {
    category = 'No-Trade';
  }

  // Unverified droppiness never clears above Speculative
  if (
    droppinessStatus === 'UNVERIFIED' &&
    (category === 'High-Priority Short Candidate' || category === 'Moderate Short Candidate')
  ) {
    category = 'Speculative Short Candidate';
  }

  const alertLabels = calculateAlertLabels(data, breakdown);

  // TRAP_RISK label mirrors the walk-away (normalized float)
  const floatShares = normalizeShareCount(data.float);
  if (floatShares !== undefined && floatShares < T.float.squeezeFloor && offeringColor === 'Green') {
    if (!alertLabels.some(a => a.label === 'TRAP_RISK')) {
      alertLabels.push({ label: 'TRAP_RISK', color: 'red' });
    }
  }

  if (walkAwayFlags.some(f => f.includes('Double Green'))) {
    alertLabels.push({ label: 'DOUBLE_GREEN_LOCKOUT', color: 'red' });
  }

  const isCashNeedHigh = breakdown.cashNeed === 25;
  const isPriceSpikeHigh = data.priceSpikePct ? data.priceSpikePct > 50 : false;
  const isOfferingRed = offeringColor === 'Red';
  if (isCashNeedHigh && isPriceSpikeHigh && isOfferingRed) {
    alertLabels.push({ label: 'DILUTION_PUMP', color: 'orange' });
  }

  const resultBase: ShortCheckResult = {
    rating: Math.round(rating * 10) / 10,
    category,
    walkAwayFlags,
    alertLabels,
    scoreBreakdown: breakdown,
    alertCard: '',
    dataCompleteness: Math.round(dataCompleteness * 1000) / 1000,
    droppinessStatus,
    spikeCount,
  };

  resultBase.alertCard = generateAlertCard(data.ticker, resultBase, data);

  return resultBase;
}

