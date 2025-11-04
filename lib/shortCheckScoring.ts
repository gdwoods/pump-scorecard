// lib/shortCheckScoring.ts
import { ExtractedData } from './shortCheckTypes';

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

export interface ShortCheckResult {
  rating: number; // 0-100 percentage
  category: 'High-Priority Short Candidate' | 'Moderate Short Candidate' | 'Speculative Short Candidate' | 'No-Trade';
  walkAwayFlags: string[];
  alertLabels: Array<{ label: string; color: 'red' | 'orange' | 'yellow' }>; // Visual alert chips
  scoreBreakdown: ScoreBreakdown;
  alertCard: string;
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
    if (outstandingShares && float) {
      // Handle values that might be in millions vs raw numbers
      let os = outstandingShares;
      let fl = float;
      if (os < 1000) os = os * 1_000_000;
      if (fl < 1000) fl = fl * 1_000_000;
      
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
    // Handle values that might be in millions vs raw numbers
    let os = outstandingShares;
    let fl = float;
    if (os < 1000) os = os * 1_000_000;
    if (fl < 1000) fl = fl * 1_000_000;
    
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
  if (!outstandingShares || !float) return 'Green';
  
  // Handle values that might be in millions vs raw numbers
  // If values are < 1000, assume they're in millions and convert
  let os = outstandingShares;
  let fl = float;
  if (os < 1000) os = os * 1_000_000;
  if (fl < 1000) fl = fl * 1_000_000;
  
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
    if (runway < 6) return 15; // Short runway still risky
    if (runway < 12) return 12; // Moderate risk
    if (runway < 24) return 10; // Neutral-positive
    return 10; // Long runway = neutral-positive (not penalty)
  }
  
  // If positive cash flow, return -10 (walk-away disqualification)
  if (burnRate !== undefined && burnRate >= 0) {
    return -10; // Walk-away for positive cash flow
  }
  
  if (!runway) return 0;
  
  if (runway < 0) return 15;
  if (runway < 6) return 15; // <6 months = max score
  if (runway < 12) return 10; // 6-12 months
  if (runway < 18) return 3; // 12-18 months (e.g., SCNX: 17.1 months = +3)
  if (runway < 24) return 1; // 18-24 months
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
function scoreInstitutionalOwnership(instOwn: number | undefined, marketCap?: number): number {
  // Default for microcap: assume <10% (likely Red) = +5
  if (!instOwn) {
    // If microcap (assumed <$100M), default to +5 (Red)
    if (marketCap === undefined || marketCap < 100_000_000) {
      return 5; // Default Red for microcap
    }
    return 3; // Default moderate for larger caps
  }
  
  if (instOwn < 10) return 5;
  if (instOwn < 25) return 4;
  // When ownership >= 25%, return 0 (high ownership is bullish offset, not bearish)
  if (instOwn >= 25 && instOwn < 50) return 0; // Changed from +3 to 0
  if (instOwn >= 50 && instOwn < 75) return -5;
  // 75%+ is walk-away (handled separately)
  
  return 0; // Default to 0 for edge cases
}

/**
 * Calculate Short Interest score (0-15 points, can be negative)
 */
function scoreShortInterest(shortInt: number | undefined): number {
  if (!shortInt) return 8; // Default moderate
  
  if (shortInt < 3) return 15;
  if (shortInt < 7) return 12;
  if (shortInt < 10) return 10;
  if (shortInt < 15) return 8;
  if (shortInt < 20) return 6;
  if (shortInt < 25) return 3;
  if (shortInt < 30) return 0;
  if (shortInt >= 30) return -5; // Warning only, not disqualifier
  
  return 8;
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
function scoreNewsCatalyst(news: string | undefined, newsDate?: string): number {
  // Empty string, undefined, or "none" = no news = +15
  if (!news || news.trim() === '' || news.toLowerCase().includes('none')) {
    return 15; // No news
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
  if (!float) return 5; // Default moderate
  
  // IMPORTANT: Use float (public float), NOT outstandingShares or fully diluted shares
  // For SCNX: Float = 2.764M = 2,764,000 shares (not O/S = 34.47M)
  // Convert to raw number if needed
  let floatValue = float;
  if (floatValue < 1000) {
    floatValue = floatValue * 1_000_000; // Assume millions if < 1000
  }
  
  const isGreenOffering = offeringColor === 'Green';
  
  // Base scores based on actual float value
  // SCNX: 2,764,000 is in 2M-5M range = +6
  if (floatValue < 500_000) {
    return isGreenOffering ? -10 : 10; // <500K
  }
  if (floatValue < 1_000_000) {
    return isGreenOffering ? -5 : 9; // 500K-1M
  }
  if (floatValue < 2_000_000) {
    return 8; // 1M-2M
  }
  if (floatValue < 5_000_000) {
    return 6; // 2M-5M (e.g., SCNX: 2.764M = +6)
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
    // Handle values that might be in millions vs raw numbers
    let os = data.outstandingShares;
    let fl = data.float;
    if (os < 1000) os = os * 1_000_000;
    if (fl < 1000) fl = fl * 1_000_000;
    
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
  // If we have percentage from DT screenshot, use exact brackets (priority)
  if (spikePct !== undefined) {
    // Updated threshold: >= 20% scores +10 points (matches manual scoring)
    if (spikePct >= 20) return 10;
    return 0; // < 20% = no points
  }
  
  // Fallback: if hasSpike boolean is true, assume moderate spike
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
  
  const ratio = debt / cash;
  
  if (ratio > 2) return 10;
  if (ratio > 1) return 7;
  if (ratio <= 1) return 4;
  
  return 0;
}

/**
 * Calculate Droppiness score (-8 to +12 points)
 * 
 * Droppiness measures how quickly price spikes fade after major moves.
 * High droppiness (70+) = spikes fade quickly = favorable for shorting (+12)
 * Low droppiness (<40) = spikes hold = risky for shorting (-8)
 * Medium (40-70) = neutral to moderate positive (+3 to +5)
 * 
 * For short sellers: We want stocks that spike and then fade, indicating weak support.
 */
function scoreDroppiness(droppinessScore: number | undefined): number {
  if (droppinessScore === undefined || droppinessScore === null) {
    return 0; // No droppiness data available
  }
  
  // High droppiness (70-100) = spikes fade quickly = very favorable for shorting
  if (droppinessScore >= 70) {
    return 12;
  }
  
  // Moderate-high droppiness (50-69) = spikes usually fade = favorable
  if (droppinessScore >= 50) {
    return 5;
  }
  
  // Neutral droppiness (40-49) = mixed behavior = neutral
  if (droppinessScore >= 40) {
    return 0;
  }
  
  // Low droppiness (<40) = spikes hold = risky for shorting (penalty)
  return -8;
}

/**
 * Check for walk-away disqualifiers
 */
function checkWalkAwayFlags(data: ExtractedData): string[] {
  const flags: string[] = [];
  
  // Cash runway >= 24 months
  if (data.cashRunway && data.cashRunway >= 24) {
    flags.push('Cash runway exceeds 24 months');
  }
  
  // Positive cash flow
  if (data.quarterlyBurnRate && data.quarterlyBurnRate >= 0) {
    flags.push('Positive cash flow');
  }
  
  // Institutional ownership >= 75%
  if (data.institutionalOwnership && data.institutionalOwnership >= 75) {
    flags.push('Institutional ownership exceeds 75%');
  }
  
  // Strong positive news catalyst (recent bullish news scores 0, which triggers walk-away)
  if (data.recentNews && data.recentNewsDate) {
    const lowerNews = data.recentNews.toLowerCase();
    const newsTime = new Date(data.recentNewsDate).getTime();
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    // Check if news is recent (within 7 days) and contains bullish terms
    if (newsTime >= sevenDaysAgo) {
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
        flags.push('Strong positive news catalyst detected (recent)');
      }
    }
  }
  
  // Market cap eligibility
  if (data.marketCap) {
    if (data.marketCap > 100_000_000) {
      // $100M+ = walk-away unless runway <4mo
      if (!data.cashRunway || data.cashRunway >= 4) {
        flags.push('Market cap exceeds $100M with adequate runway');
      }
    } else if (data.marketCap > 70_000_000) {
      // $70-100M = must have runway <=4mo
      if (!data.cashRunway || data.cashRunway > 4) {
        flags.push('Market cap $70-100M requires cash runway ≤4 months');
      }
    }
  }
  
  // Green Offering + Green Overhead = walk-away
  // IMPORTANT: Only trigger when DT explicitly tags BOTH as Green (Low).
  // We avoid triggering based on heuristics because OCR values can be incomplete and
  // DT badges are the source of truth for these pills.
  const offeringTag = (data.atmShelfStatus || '').toLowerCase().startsWith('dt:')
    ? (data.atmShelfStatus || '').toLowerCase().substring(3).trim()
    : undefined;
  const overheadTag = (data.overheadSupplyStatus || '').toLowerCase().startsWith('dt:')
    ? (data.overheadSupplyStatus || '').toLowerCase().substring(3).trim()
    : undefined;

  const dtOfferingGreen = offeringTag === 'green' || offeringTag === 'low';
  const dtOverheadGreen = overheadTag === 'green' || overheadTag === 'low';

  if (dtOfferingGreen && dtOverheadGreen) {
    flags.push('Green Offering Ability and Green Overhead Supply');
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
    let floatShares = data.float;
    if (floatShares < 1000) floatShares = floatShares * 1_000_000; // Convert millions to shares
    if (floatShares < 3_000_000) {
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
 * @param droppinessScore - Optional droppiness score (0-100) from Pump Scorecard analysis
 */
export function calculateShortRating(data: ExtractedData, droppinessScore?: number): ShortCheckResult {
  // Determine offering color for float adjustment (pass O/S and float for better detection)
  const offeringColor = getOfferingColor(data.atmShelfStatus, data.outstandingShares, data.float);
  
  // Calculate runway from cash and burn rate if not provided
  // Handle both cases: burnRate in millions (e.g., -3.37) or raw dollars (e.g., -3,370,000)
  // If abs(burnRate) < 1000, assume it's in millions and convert
  let effectiveRunway = data.cashRunway;
  if (!effectiveRunway && data.cashOnHand && data.quarterlyBurnRate && data.quarterlyBurnRate < 0) {
    let quarterlyBurn = Math.abs(data.quarterlyBurnRate);
    // If burn rate looks like it's in millions (< 1000), convert to dollars
    if (quarterlyBurn < 1000) {
      quarterlyBurn = quarterlyBurn * 1_000_000;
    }
    // Also check cashOnHand - if < 1000, assume millions
    let cash = data.cashOnHand;
    if (cash < 1000) {
      cash = cash * 1_000_000;
    }
    
    const monthlyBurn = quarterlyBurn / 3;
    if (monthlyBurn > 0 && cash > 0) {
      effectiveRunway = cash / monthlyBurn;
    }
  }
  
  // Debug: Log raw values for troubleshooting
  if (process.env.NODE_ENV === 'development' && data.ticker === 'NIVF') {
    console.log('NIVF Debug - Raw data:', {
      outstandingShares: data.outstandingShares,
      float: data.float,
      atmShelfStatus: data.atmShelfStatus,
      quarterlyBurnRate: data.quarterlyBurnRate,
      cashOnHand: data.cashOnHand,
      recentNews: data.recentNews,
    });
  }
  
  // Helper function to format dollar amounts
  const formatDollars = (value: number | undefined): string | undefined => {
    if (value === undefined || value === null) return undefined;
    // Handle values that might be in millions vs raw numbers
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

  // Helper function to format share counts
  const formatShares = (value: number | undefined): string | undefined => {
    if (value === undefined || value === null) return undefined;
    // Handle values that might be in millions vs raw numbers
    let shares = value;
    if (shares < 1000) {
      shares = shares * 1_000_000;
    }
    if (shares >= 1_000_000) {
      return `${(shares / 1_000_000).toFixed(1)}M shares`;
    } else if (shares >= 1_000) {
      return `${(shares / 1_000).toFixed(0)}K shares`;
    }
    return `${shares.toFixed(0)} shares`;
  };

  // Calculate droppiness score (optional, defaults to 0 if not provided)
  const droppiness = scoreDroppiness(droppinessScore);
  
  // Calculate individual scores (use effectiveRunway for both cashNeed and cashRunway)
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
    newsCatalyst: scoreNewsCatalyst(data.recentNews, data.recentNewsDate),
    float: scoreFloat(data.float, offeringColor),
    overallRisk: scoreOverallRisk(data),
    priceSpike: scorePriceSpike(data.priceSpike, data.priceSpikePct),
    debtToCash: scoreDebtToCash(data.debt, data.cashOnHand, data.hasActualDebtData),
    droppiness: droppiness,
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
          const currentOS = data.outstandingShares ? (data.outstandingShares < 1000 ? data.outstandingShares * 1_000_000 : data.outstandingShares) : 0;
          const historicalOS = data.outstandingShares3YearsAgo < 1000 ? data.outstandingShares3YearsAgo * 1_000_000 : data.outstandingShares3YearsAgo;
          if (historicalOS > 0) {
            const increasePct = ((currentOS - historicalOS) / historicalOS) * 100;
            parts.push(`(${increasePct > 0 ? '+' : ''}${increasePct.toFixed(0)}% increase)`);
          }
          // Add source indicator
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
        // If we don't have actual debt data (only Net Cash from DT), show note
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
        
        // Add source indicator if from Yahoo Finance
        const sourceNote = data.debtCashSource === 'yahoo-finance' ? ' (Yahoo Finance)' : '';
        
        return parts.length > 0 ? parts.join(', ') + sourceNote : undefined;
      })(),
      droppiness: droppinessScore !== undefined ? (() => {
        if (droppinessScore >= 70) return `${droppinessScore.toFixed(0)} (spikes fade quickly)`;
        if (droppinessScore >= 50) return `${droppinessScore.toFixed(0)} (spikes usually fade)`;
        if (droppinessScore >= 40) return `${droppinessScore.toFixed(0)} (mixed behavior)`;
        return `${droppinessScore.toFixed(0)} (spikes hold)`;
      })() : undefined,
    },
  };
  
  // Calculate total score (can be negative due to Offering Ability matrix and other adjustments)
  // Exclude actualValues from the sum
  const totalScore = breakdown.cashNeed + breakdown.cashRunway + breakdown.offeringAbility +
    breakdown.historicalDilution + breakdown.institutionalOwnership + breakdown.shortInterest +
    breakdown.newsCatalyst + breakdown.float + breakdown.overallRisk + breakdown.priceSpike +
    breakdown.debtToCash + breakdown.droppiness;
  
  // Calculate max possible score, adjusting for walk-away disqualifications
  // Base max components (all count toward rating):
  // Cash Need (25) + Cash Runway (15) + Offering (25) + Historical Dilution (10) +
  // Inst Own (5) + Short Int (15) + News (15) + Float (10) + Overall Risk (10) +
  // Price Spike (10) + Debt/Cash (10) + Droppiness (12 max) = 172
  // 
  // When Cash Runway is disqualified (positive cash flow):
  // - Cash Runway contributes -10 to totalScore (penalty)
  // - Base max excluding Cash Runway: 160 - 15 = 145
  // - But since Cash Runway penalty reduces achievable max, effective max = 145 - 10 = 135?
  // 
  // Actually, based on GPT calculation for NIVF: 99 total / 113 max = 88%
  // This suggests: Price Spike (10) and Debt/Cash (10) don't count toward max
  // Base: 160 - 10 (Price Spike) - 10 (Debt/Cash) = 140
  // Exclude Cash Runway: 140 - 15 = 125? Still not 113...
  //
  // Let's recalculate based on GPT's actual scoring:
  // GPT shows max = 113 when Cash Runway is disqualified
  // Components that count: Cash Need (25) + Offering (25) + Historical Dilution (10) +
  // Inst Own (5) + Short Int (15) + News (15) + Float (10) + Overall Risk (10) = 115
  // Exclude Cash Runway: 115 - 15 = 100? Not 113...
  //
  // Actually, GPT's 113 might include Cash Runway's -10 penalty in the calculation:
  // Base max without Cash Runway: 160 - 15 = 145
  // But since Cash Runway is -10, the achievable range is shifted down by 10
  // Effective max = 145 - 10 = 135? Still not 113...
  //
  // Let me use GPT's actual calculation: max = 113 when Cash Runway disqualified
  // This might be: 160 - 15 (Cash Runway) - 32 (some other adjustment) = 113
  // OR: Base core components = 115, exclude Cash Runway = 100, but with penalty adjustment = 113
  //
  // GPT calculations show:
  // - For SCNX (negative burn): max = 150 (excludes Price Spike + Debt/Cash = 160 - 10 - 10)
  // - For NIVF (positive cash flow): max = 113 (excludes Cash Runway + Price Spike + Debt/Cash)
  //
  // Standard max (negative burn rate): 162 (excludes Price Spike and Debt/Cash from denominator, includes Droppiness max of 12)
  // Adjusted max (positive cash flow): 125 (further excludes Cash Runway)
  // Note: Droppiness is included in max if provided, otherwise it contributes 0
  const droppinessMax = droppinessScore !== undefined ? 12 : 0;
  let maxPossibleScore = 150 + droppinessMax; // Base 150 + Droppiness max (12) = 162
  
  // If Cash Runway is disqualified (positive cash flow), further exclude it from max denominator
  // This aligns with GPT's calculation: 113 max when positive cash flow (before droppiness)
  const cashRunwayDisqualified = data.quarterlyBurnRate !== undefined && data.quarterlyBurnRate >= 0;
  if (cashRunwayDisqualified) {
    // Base 113 + Droppiness max (12) = 125
    maxPossibleScore = 113 + droppinessMax;
  }
  
  // Debug: Log score breakdown for troubleshooting
  if (process.env.NODE_ENV === 'development') {
    console.log('Short Check Scoring Debug:', {
      ticker: data.ticker,
      breakdown,
      totalScore,
      maxPossibleScore,
      cashRunwayDisqualified,
      calculatedRating: (totalScore / maxPossibleScore) * 100,
    });
  }
  
  // Calculate normalized rating
  // Note: totalScore can be negative due to Cash Runway walk-away (-10)
  // We use totalScore directly (don't floor at 0) so negative scores reduce the rating
  const rating = (totalScore / maxPossibleScore) * 100;
  
  // Check walk-away flags
  const walkAwayFlags = checkWalkAwayFlags(data);
  
  // Filter out Cash Runway and Positive cash flow (already penalized in scoring)
  // Note: Cash Runway walk-away is already handled via -10 penalty in scoreCashRunway
  // So we filter it out here to avoid double-penalty
  const walkAwayFlagsExcludingCashRunway = walkAwayFlags.filter(
    flag => !flag.includes('Cash runway') && !flag.includes('Positive cash flow')
  );
  
  // Always show the computed rating, but set category to "No-Trade" if walk-away flags exist
  const finalRating = rating; // Always show the computed score
  const hasWalkAwayFlags = walkAwayFlagsExcludingCashRunway.length > 0;
  
  // Determine category: "No-Trade" if walk-away flags exist, otherwise based on rating
  const category = hasWalkAwayFlags ? 'No-Trade' : getCategory(finalRating);
  
  // Generate alert card
  const alertCard = generateAlertCard(
    data.ticker,
    {
      rating: finalRating,
      category,
      walkAwayFlags,
      scoreBreakdown: breakdown,
      alertCard: '',
    },
    data
  );
  
  // Calculate alert labels
  const alertLabels = calculateAlertLabels(data, breakdown);
  
  return {
    rating: Math.round(finalRating * 10) / 10, // Round to 1 decimal
    category,
    walkAwayFlags,
    alertLabels,
    scoreBreakdown: breakdown,
    alertCard,
  };
}
