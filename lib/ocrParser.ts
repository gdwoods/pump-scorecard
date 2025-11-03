// lib/ocrParser.ts
import sharp from 'sharp';
import { ExtractedData } from './shortCheckTypes';

// Re-export for backwards compatibility
export type { ExtractedData };

/**
 * Preprocess image to improve OCR accuracy
 */
async function preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const processed = await sharp(imageBuffer)
      .greyscale() // Convert to grayscale
      .normalize() // Enhance contrast
      .sharpen() // Sharpen edges
      .toBuffer();
    return processed;
  } catch (error) {
    console.error('Image preprocessing failed:', error);
    return imageBuffer; // Return original if preprocessing fails
  }
}

/**
 * Parse a dollar amount string (e.g., "$2.4M", "$1.99M", "$77.9M")
 */
function parseDollarAmount(text: string): number | null {
  const cleaned = text.replace(/[^0-9.MBKmkbd-]/g, '');
  const match = cleaned.match(/(-?\d+\.?\d*)([MKmk]?)/i);
  if (!match) return null;
  
  const value = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  
  let multiplier = 1;
  if (suffix === 'M') multiplier = 1_000_000;
  else if (suffix === 'K') multiplier = 1_000;
  else if (suffix === 'B') multiplier = 1_000_000_000;
  
  return value * multiplier;
}

/**
 * Parse a percentage string (e.g., "35.8%", "0.6%")
 */
function parsePercentage(text: string): number | null {
  const match = text.match(/(\d+\.?\d*)\s*%/);
  if (!match) return null;
  return parseFloat(match[1]);
}

/**
 * Parse a number with suffix (e.g., "17.72M", "41.42M")
 */
function parseNumberWithSuffix(text: string): number | null {
  // Handle comma-separated numbers like "4,324,565"
  const cleaned = text.replace(/[^0-9.,MKmk]/g, '').replace(/,/g, '');
  const match = cleaned.match(/(\d+\.?\d*)([MKmk]?)/i);
  if (!match) return null;
  
  const value = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  
  // If the number is already large (>1000) and has no suffix, assume it's already in raw format
  // Otherwise, if it has M/K suffix or is small, apply multiplier
  if (value > 1000 && !suffix) {
    return value; // Already in raw format (e.g., 4324565)
  }
  
  let multiplier = 1;
  if (suffix === 'M') multiplier = 1_000_000;
  else if (suffix === 'K') multiplier = 1_000;
  
  return value * multiplier;
}

/**
 * Parse months from text (e.g., "3.7 months", "3.7 mo")
 */
function parseMonths(text: string): number | null {
  const match = text.match(/(\d+\.?\d*)\s*(?:months?|mo)/i);
  if (!match) return null;
  return parseFloat(match[1]);
}

/**
 * Extract ticker symbol from text
 */
function extractTicker(text: string): string | undefined {
  // Common ticker patterns:
  // 1. "$TICKER" format
  // 2. "Ticker: TICKER" format
  // 3. Standalone uppercase 1-5 letter codes (not common words)
  // 4. In context like "Company (TICKER)"
  
  // Try $TICKER format first
  const dollarMatch = text.match(/\$([A-Z]{1,5})\b/);
  if (dollarMatch && dollarMatch[1].length >= 1 && dollarMatch[1].length <= 5) {
    return dollarMatch[1];
  }
  
  // Try "Ticker:" format
  const tickerColonMatch = text.match(/ticker[:\s]+([A-Z]{1,5})\b/i);
  if (tickerColonMatch && tickerColonMatch[1].length >= 1 && tickerColonMatch[1].length <= 5) {
    return tickerColonMatch[1];
  }
  
  // Try standalone uppercase codes (avoid common words)
  const commonWords = new Set(['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'ITS', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE']);
  const standaloneMatch = text.match(/\b([A-Z]{1,5})\b/);
  if (standaloneMatch && standaloneMatch[1].length >= 1 && standaloneMatch[1].length <= 5) {
    const candidate = standaloneMatch[1];
    // Filter out common words and numbers
    if (!commonWords.has(candidate) && !/^\d+$/.test(candidate)) {
      return candidate;
    }
  }
  
  return undefined;
}

/**
 * Extract ATM/Shelf status from text
 * Detects: ATM Active, S-1 Filed, Equity Line, Share Purchase Agreement, etc.
 */
function extractAtmShelfStatus(text: string): string | undefined {
  let workingText = text;
  let lower = workingText.toLowerCase();
  
  // FIRST: Check for DT's explicit visual tags for Offering Ability
  // These tags take ABSOLUTE precedence - return immediately, don't continue with keyword detection
  // Examples: "Offering Ability: Medium", "Offering Ability: Red", "Offering Ability: Green"
  // Also handle variations: "Offering Ability Medium", "Offering Ability=Medium", etc.
  // IMPORTANT: Use special markers so getOfferingColor can respect DT's explicit tags
  
  // Try multiple patterns to catch different OCR formats
  // IMPORTANT: DT shows "High/Medium/Low" but also uses color tags "Red/Yellow/Green"
  // We need to catch both formats
  const offeringAbilityPatterns = [
    /offering\s*ability[:\s=]+(red|yellow|medium|green|high|low)\b/i,
    /offering\s*ability\s+(red|yellow|medium|green|high|low)\b/i,
    /(?:ability|offering)[:\s=]+(red|yellow|medium|green|high|low)\b/i,
    // Flexible across line breaks: status within 120 chars AFTER the word
    /offering[\s\S]{0,120}?(medium|yellow|red|green|high|low)\b/i,
    /ability[\s\S]{0,120}?(medium|yellow|red|green|high|low)\b/i,
  ];
  
  for (const pattern of offeringAbilityPatterns) {
    const match = text.match(pattern);
    if (match) {
      const tag = match[1].toLowerCase();
      // Map DT tags to special status strings that getOfferingColor will recognize
      // The "DT:" prefix ensures getOfferingColor respects the tag and doesn't override it
      // CRITICAL: Return immediately here - do NOT continue with keyword detection
      console.log('✅ DT Offering Ability tag detected:', tag, '-> mapping to DT tag');
      if (tag === 'red' || tag === 'high') {
        return 'DT:Red'; // High = Red = +25 points
      } else if (tag === 'medium' || tag === 'yellow') {
        // Medium/Yellow = S-1 Filed but not necessarily active - MUST stay Yellow
        console.log('✅ DT Medium tag -> DT:Medium (should score +10, not +25)');
        return 'DT:Medium'; // Special marker for DT Medium tag - should score +10, not +25
      } else if (tag === 'green' || tag === 'low') {
        return 'DT:Green'; // Low = Green
      }
    }
  }
  
  // Fallback: Check if status keywords appear near "offering" or "ability" (case-insensitive)
  // This handles cases where OCR might split words or format differently
  const offeringIndex = lower.indexOf('offering');
  const abilityIndex = lower.indexOf('ability');
  
  // Check for "high", "medium", or "low" near "offering" or "ability"
  const highIndex = lower.indexOf('high');
  const mediumIndex = lower.indexOf('medium');
  const lowIndex = lower.indexOf('low');
  
  if (highIndex !== -1 && (offeringIndex !== -1 || abilityIndex !== -1)) {
    const nearOffering = offeringIndex !== -1 && Math.abs(highIndex - offeringIndex) < 100;
    const nearAbility = abilityIndex !== -1 && Math.abs(highIndex - abilityIndex) < 100;
    if (nearOffering || nearAbility) {
      console.log('✅ DT High detected via proximity check (near offering/ability) -> DT:Red');
      return 'DT:Red'; // High = Red
    }
  }
  
  if (mediumIndex !== -1 && (offeringIndex !== -1 || abilityIndex !== -1)) {
    const nearOffering = offeringIndex !== -1 && Math.abs(mediumIndex - offeringIndex) < 100;
    const nearAbility = abilityIndex !== -1 && Math.abs(mediumIndex - abilityIndex) < 100;
    if (nearOffering || nearAbility) {
      console.log('✅ DT Medium detected via proximity check (near offering/ability) -> DT:Medium');
      return 'DT:Medium'; // DT says Medium, trust that over keyword detection
    }
  }
  
  if (lowIndex !== -1 && (offeringIndex !== -1 || abilityIndex !== -1)) {
    const nearOffering = offeringIndex !== -1 && Math.abs(lowIndex - offeringIndex) < 100;
    const nearAbility = abilityIndex !== -1 && Math.abs(lowIndex - abilityIndex) < 100;
    if (nearOffering || nearAbility) {
      console.log('✅ DT Low detected via proximity check (near offering/ability) -> DT:Green');
      return 'DT:Green'; // Low = Green
    }
  }
  
  // Exclude DT "Major Developments" block from heuristic keyword scans
  const mdIndex = lower.indexOf('major developments');
  if (mdIndex !== -1) {
    // remove up to ~1000 chars after marker to avoid historical notes
    const cutEnd = Math.min(workingText.length, mdIndex + 1000);
    workingText = workingText.substring(0, mdIndex) + workingText.substring(cutEnd);
    lower = workingText.toLowerCase();
  }

  // Collect all dilution mechanisms found in the (cleaned) text
  const mechanisms: string[] = [];
  
  // Check for multiple dilution mechanisms (SCNX has ATM, Equity Line, S-1 Offering, Convertible Preferred)
  // Look for patterns like "ATM: 12.14", "Equity Line: 53.25", "S-1 Offering: 25.32"
  
  // Check for Equity Line (often with value like "Equity Line: 53.25")
  if (lower.includes('equity line')) {
    const equityLineMatch = workingText.match(/equity\s*line[:\s]*([0-9.,]+[MKmk]?)/i);
    if (equityLineMatch) {
      mechanisms.push(`Equity Line (${equityLineMatch[1]}M)`);
    } else {
      mechanisms.push('Equity Line');
    }
  }
  
  // Check for ATM/At-The-Market offerings
  if (lower.includes('atm') || lower.includes('at-the-market')) {
    const atmMatch = workingText.match(/atm[:\s]*([0-9.,]+[MKmk]?)/i) || workingText.match(/at-the-market[:\s]*([0-9.,]+[MKmk]?)/i);
    if (atmMatch) {
      mechanisms.push(`ATM (${atmMatch[1]}M)`);
    } else if (lower.includes('atm active') || lower.includes('active atm')) {
      mechanisms.push('ATM Active');
    } else {
      mechanisms.push('ATM');
    }
  }
  
  // Check for S-1 Shelf/Offering
  if (lower.includes('s-1') || lower.includes('s1')) {
    const s1Match = workingText.match(/s-1\s*(?:shelf|offering)?[:\s]*([0-9.,]+[MKmk]?)/i);
    if (s1Match) {
      mechanisms.push(`S-1 Offering (${s1Match[1]}M)`);
    } else if (lower.includes('filed') || lower.includes('pending')) {
      mechanisms.push('S-1 Filed');
    } else {
      mechanisms.push('S-1 Shelf');
    }
  }
  
  // Check for Convertible Preferred/Convertibles
  if (lower.includes('convertible preferred') || lower.includes('convertible')) {
    const convertMatch = workingText.match(/convertible\s*(?:preferred)?[:\s]*([0-9.,]+[MKmk]?)/i);
    if (convertMatch) {
      mechanisms.push(`Convertible Preferred (${convertMatch[1]}M)`);
    } else {
      mechanisms.push('Convertibles');
    }
  }
  
  // Check for warrants
  if (lower.includes('warrants')) {
    mechanisms.push('Warrants');
  }
  
  // Check for White Lion Capital (specific to some tickers)
  if (lower.includes('white lion')) {
    if (lower.includes('common shares purchase agreement') || lower.includes('share purchase agreement')) {
      mechanisms.push('Common Shares Purchase Agreement with White Lion Capital');
    } else {
      mechanisms.push('White Lion Capital Agreement');
    }
  }
  
  // Check for Common Shares Purchase Agreement
  if (lower.includes('common shares purchase agreement') || lower.includes('share purchase agreement')) {
    if (!lower.includes('white lion')) {
      mechanisms.push('Common Shares Purchase Agreement');
    }
  }
  
  // Return combined mechanisms if multiple found, otherwise return single mechanism
  if (mechanisms.length > 1) {
    return mechanisms.join(', '); // e.g., "Equity Line, ATM, S-1 Offering, Convertible Preferred"
  } else if (mechanisms.length === 1) {
    return mechanisms[0];
  }
  
  // Fallback: check for generic dilution indicators
  if (lower.includes('dilution') && (lower.includes('equity') || lower.includes('atm') || lower.includes('s-1'))) {
    return 'Multiple Dilution Mechanisms';
  }
  
  return undefined;
}

/**
 * Extract Overhead Supply status from DT screenshot
 * Looks for "Overhead Supply: Low/Medium/High" or similar patterns
 */
function extractOverheadSupplyStatus(text: string): string | undefined {
  return extractDTStatus(text, 'overhead supply');
}

/**
 * Generic function to extract DT card status for any metric
 * Looks for patterns like "Metric Name: Low/Medium/High" or proximity-based detection
 */
function extractDTStatus(text: string, metricName: string): string | undefined {
  const lower = text.toLowerCase();
  const metricLower = metricName.toLowerCase();

  // Pattern 1: "Metric Name: Low/Medium/High" with colon (strongest signal)
  const colonPattern = new RegExp(
    `${metricLower.replace(/\s+/g, '\\s+')}\s*[:=]\s*(low|medium|high|red|yellow|green)\b`,
    'i'
  );
  const colonMatch = text.match(colonPattern);
  if (colonMatch) {
    return mapDTTag(colonMatch[1].toLowerCase());
  }

  // Pattern 2: "Metric Name Low/Medium/High" without colon
  const spacePattern = new RegExp(
    `${metricLower.replace(/\s+/g, '\\s+')}\s+(low|medium|high|red|yellow|green)\b`,
    'i'
  );
  const spaceMatch = text.match(spacePattern);
  if (spaceMatch) {
    return mapDTTag(spaceMatch[1].toLowerCase());
  }

  // Pattern 3: Proximity-based — only consider terms AFTER the metric, within 50 chars
  const metricIndex = lower.indexOf(metricLower);
  if (metricIndex !== -1) {
    const after = lower.slice(metricIndex);
    const searchWindow = 50; // tighten window to avoid stray matches

    // Find nearest status token after the metric
    const tokens: Array<{ label: 'red'|'yellow'|'green'|'high'|'medium'|'low'; index: number }> = [];
    ['red', 'yellow', 'green', 'high', 'medium', 'low'].forEach((label) => {
      const idx = after.indexOf(label);
      if (idx !== -1 && idx <= searchWindow) {
        tokens.push({ label: label as any, index: idx });
      }
    });

    if (tokens.length > 0) {
      tokens.sort((a, b) => a.index - b.index);
      const first = tokens[0].label;
      if (first === 'red' || first === 'high') return 'DT:Red';
      if (first === 'yellow' || first === 'medium') return 'DT:Yellow';
      if (first === 'green' || first === 'low') return 'DT:Green';
    }
  }

  return undefined;
}

/**
 * Map DT tag text to standardized DT tag format
 * Handles both color tags (red/yellow/green) and text labels (high/medium/low)
 */
function mapDTTag(tag: string): string {
  const normalized = tag.toLowerCase().trim();
  if (normalized === 'high' || normalized === 'red') {
    return 'DT:Red';
  } else if (normalized === 'medium' || normalized === 'yellow') {
    return 'DT:Yellow';
  } else if (normalized === 'low' || normalized === 'green') {
    return 'DT:Green';
  }
  return undefined as any;
}

/**
 * Extract price spike percentage from Dilution Tracker (DT) screenshot
 * Looks for green cards next to ticker with format:
 * - Left card: "$1.56" and "18.18%" (current price & day change)
 * - Right card: "E $1.88" and "20.51%" (estimate/extended hours)
 * Returns the larger of the two percentages, or null if not found
 * 
 * IMPORTANT: Must look specifically for percentages next to price values, NOT
 * other percentages like institutional ownership (e.g., 35.8%) which appear elsewhere.
 */
function extractPriceSpikeFromDT(text: string): number | null {
  const priceMatches: number[] = [];
  
  // Pattern 1: Look for standard price format "$X.XX" followed by percentage
  // Format: "$1.56" followed by "18.18%" (current price & day change)
  // Captures patterns like: "$1.56 18.18%" or "$1.56\n18.18%" or "$1.56\t18.18%"
  const standardPricePattern = /\$(\d+\.?\d*)\s+(\d+\.?\d*)\s*%/g;
  let match;
  while ((match = standardPricePattern.exec(text)) !== null) {
    const price = parseFloat(match[1]);
    const pct = parseFloat(match[2]);
    // Validate: price should be reasonable (0.01-1000) and percentage should be day change (0-200%)
    if (price >= 0.01 && price <= 1000 && pct >= 0 && pct <= 200) {
      priceMatches.push(pct);
    }
  }
  
  // Pattern 2: Look for extended hours format "E $X.XX" followed by percentage
  // Format: "E $1.88" followed by "20.51%" (estimate/extended hours)
  // This is the right card in DT's green price boxes
  const extendedHoursPattern = /E\s*\$(\d+\.?\d*)\s+(\d+\.?\d*)\s*%/gi;
  while ((match = extendedHoursPattern.exec(text)) !== null) {
    const price = parseFloat(match[1]);
    const pct = parseFloat(match[2]);
    if (price >= 0.01 && price <= 1000 && pct >= 0 && pct <= 200) {
      priceMatches.push(pct);
    }
  }
  
  // Pattern 3: More flexible - dollar sign followed by digits, then percentage within close proximity
  // This handles variations in spacing/formatting
  // Look for pattern: $X.XX (some whitespace/newlines) Y.YY%
  const flexiblePricePattern = /\$(\d+\.?\d*)[\s\n\r]{0,20}(\d+\.?\d*)\s*%/g;
  while ((match = flexiblePricePattern.exec(text)) !== null) {
    const price = parseFloat(match[1]);
    const pct = parseFloat(match[2]);
    // More restrictive: only accept if it looks like a day change (typically <100%)
    // This helps filter out other percentages that might appear near prices
    if (price >= 0.01 && price <= 1000 && pct >= 0 && pct <= 100) {
      // Avoid duplicates - only add if not already captured by previous patterns
      if (!priceMatches.includes(pct)) {
        priceMatches.push(pct);
      }
    }
  }
  
  // Return the largest percentage found near price values
  // This should be the day change percentage from the green cards (e.g., 20.51% for MSAI)
  if (priceMatches.length > 0) {
    return Math.max(...priceMatches);
  }
  
  // If no price-adjacent percentages found, return null
  // Don't fall back to all percentages as that might grab institutional ownership (e.g., 35.8%)
  return null;
}

/**
 * Check for price spike indicators (fallback method)
 */
function detectPriceSpike(text: string): boolean {
  const lower = text.toLowerCase();
  // Look for common spike indicators
  const spikeKeywords = ['spike', 'surge', 'jump', 'rally', 'gain', 'up 18%', 'up 20%'];
  return spikeKeywords.some(keyword => lower.includes(keyword));
}

/**
 * Extract news information
 */
function extractNews(text: string): { headline: string; date?: string } | undefined {
  // 1) Prefer explicit News line if present
  const newsMatch = text.match(/news[:\s]+(.*?)(?:\n|$)/i);
  if (newsMatch && newsMatch[1] && !newsMatch[1].toLowerCase().includes('none')) {
    return { headline: newsMatch[1].trim() };
  }

  // 2) Fallback: Detect DT "Major Developments" section, but ONLY within last 7 days
  // Example lines near the section:
  // "Major Developments"
  // "9/3/2025, 10:08:35 PM  Wind down cancelled, new PIPE to existing shareholders."
  const lower = text.toLowerCase();
  const markerIndex = lower.indexOf('major developments');
  if (markerIndex !== -1) {
    const after = text.substring(markerIndex, Math.min(text.length, markerIndex + 800));
    // Find the first date-like pattern MM/DD/YYYY or M/D/YYYY with optional time
    const dateRegex = /(\b\d{1,2}\/\d{1,2}\/\d{2,4})(?:,?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?/i;
    const dateMatch = after.match(dateRegex);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        const days = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
        if (days <= 7) {
          // Extract the rest of the line as headline
          const lineStart = after.indexOf(dateMatch[0]);
          const rest = after.substring(lineStart + dateMatch[0].length).split('\n')[0].trim();
          const headline = rest.replace(/^[,\-:\s]+/, '').trim();
          if (headline) {
            return { headline, date: parsed.toISOString() };
          }
        }
      }
    }
  }

  return undefined;
}

/**
 * Main OCR extraction function using Google Cloud Vision API
 */
export async function extractDataFromImage(imageBuffer: Buffer): Promise<ExtractedData> {
  try {
    console.log('OCR: Starting image preprocessing...');
    // Preprocess image
    const processedImage = await preprocessImage(imageBuffer);
    console.log('OCR: Image preprocessing complete, size:', processedImage.length);
    
    // Check if Google Cloud Vision API key is configured
    if (!process.env.GOOGLE_CLOUD_VISION_API_KEY && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error('Google Cloud Vision API key not configured. Please set GOOGLE_CLOUD_VISION_API_KEY or GOOGLE_APPLICATION_CREDENTIALS environment variable. You can use manual entry as an alternative.');
    }
    
    console.log('OCR: Initializing Google Cloud Vision API call...');
    console.log('OCR: API key configured:', !!process.env.GOOGLE_CLOUD_VISION_API_KEY);
    console.log('OCR: API key preview:', process.env.GOOGLE_CLOUD_VISION_API_KEY ? `${process.env.GOOGLE_CLOUD_VISION_API_KEY.substring(0, 10)}...` : 'not set');
    
    // Use REST API with API key authentication
    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_CLOUD_VISION_API_KEY not set');
    }
    
    // Convert image buffer to base64
    const base64Image = processedImage.toString('base64');
    
    console.log('OCR: Performing text detection via REST API...');
    // Call Google Cloud Vision REST API
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image,
              },
              features: [
                {
                  type: 'TEXT_DETECTION',
                },
              ],
            },
          ],
        }),
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Google Cloud Vision API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }
    
    const result = await response.json();
    
    if (!result.responses || !result.responses[0]) {
      throw new Error('Invalid response from Google Cloud Vision API');
    }
    
    const annotations = result.responses[0].textAnnotations;
    if (!annotations || annotations.length === 0) {
      throw new Error('No text detected in image');
    }
    
    // Get full text from first annotation (contains all text)
    const fullText = annotations[0].description || '';
    console.log('OCR: Recognition complete, text length:', fullText.length);
    // Log first 500 chars for debugging extraction patterns
    console.log('OCR: Extracted text preview:', fullText.substring(0, 500));
    
    // Calculate confidence from annotations
    const confidence = annotations.length > 1 
      ? Math.min(annotations.slice(1).reduce((acc, d) => acc + (d.confidence || 0), 0) / (annotations.length - 1) / 100, 1)
      : 0.8; // Default confidence if only full text available
    
    // Parse extracted text
    const extracted: ExtractedData = {
      confidence,
    };
    
    // Extract ticker
    extracted.ticker = extractTicker(fullText);
    
    // Extract cash on hand (look for patterns like "$2.4M", "Cash: $2.4M", "estimated current cash")
    // IMPORTANT: DT screenshots often show "Net Cash per Share" which is Cash - Debt
    // We need to distinguish between actual cash vs net cash to know if we can calculate debt/cash ratio
    // Priority: Look for "Cash Position" section first (most reliable)
    // Format: "estimated current cash of $14.2M" or "cash left based on quarterly cash burn"
    
    // First check for "Net Cash" (which means Cash - Debt, so we can't derive debt from it)
    const netCashPatterns = [
      /net\s*cash\s*(?:per\s*share|per\s*shr)?[:\s]*\$?([0-9.,MKmk]+)/i,
      /estimated\s*net\s*cash[:\s]*\$?([0-9.,MKmk]+)/i,
    ];
    let foundNetCash = false;
    for (const pattern of netCashPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const parsed = parseDollarAmount(match[1]);
        if (parsed) {
          // If we have O/S, we can calculate total net cash
          // But this is Net Cash = Cash - Debt, so we can't get debt separately
          if (extracted.outstandingShares) {
            let os = extracted.outstandingShares;
            if (os < 1000) os = os * 1_000_000; // Convert to raw shares
            const netCashPerShare = parsed;
            const totalNetCash = netCashPerShare * os;
            extracted.cashOnHand = totalNetCash; // Store as cash (but it's actually net cash)
            foundNetCash = true;
            break;
          }
        }
      }
    }
    
    // If we didn't find net cash, look for actual cash amounts
    if (!foundNetCash) {
      const cashPatterns = [
        /estimated\s*(?:current\s*)?cash\s*(?:of|is|:)?\s*\$?([0-9.,MKmk]+)/i, // "estimated current cash of $14.2M"
        /cash\s*(?:on\s*hand|position|left|available)?[:\s]*\$?([0-9.,MKmk]+)/i,
        /\$([0-9.,MKmk]+)\s*(?:cash|million|M)\b/i,
        /current\s*cash[:\s]*\$?([0-9.,MKmk]+)/i,
        /cash\s*balance[:\s]*\$?([0-9.,MKmk]+)/i,
      ];
      for (const pattern of cashPatterns) {
        const match = fullText.match(pattern);
        if (match) {
          const parsed = parseDollarAmount(match[1]);
          if (parsed) {
            extracted.cashOnHand = parsed;
            break;
          }
        }
      }
    }
    
    // Extract quarterly burn rate (look for negative amounts OR positive cash flow)
    // IMPORTANT: Check for positive cash flow FIRST if explicitly stated as "cashflow positive"
    // Then check for negative cash flow (TTM FCF, free cash flow, etc.)
    
    // First, check for explicit "cashflow positive" or "positive cash flow" statements
    const explicitPositivePatterns = [
      /cashflow\s*positive\s*(?:based\s*on|with|of)?\s*(?:quarterly\s*)?(?:operating\s*)?cash\s*flow\s*(?:of)?\s*\$?([0-9.MKmk]+)/i, // "cashflow positive based on quarterly operating cash flow of $0.34M"
      /positive\s*cash\s*flow\s*(?:based\s*on|with|of)?\s*(?:quarterly\s*)?(?:operating\s*)?cash\s*flow\s*(?:of)?\s*\$?([0-9.MKmk]+)/i,
      /(?:quarterly\s*)?(?:operating\s*)?cash\s*flow\s*(?:of)?\s*\$?([0-9.MKmk]+)\s*(?:is\s*)?positive/i,
    ];
    
    let foundPositive = false;
    for (const pattern of explicitPositivePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const parsed = parseDollarAmount(match[1]);
        if (parsed && parsed > 0) {
          extracted.quarterlyBurnRate = parsed; // Positive value = positive cash flow
          foundPositive = true;
          break;
        }
      }
    }
    
    // If no explicit positive cash flow found, check for negative cash flow
    if (!foundPositive) {
      // Priority: Look for "Cash Position" section format
      // Format: "quarterly cash burn of -$2.5M" or "based on quarterly cash burn of -$2.5M"
      const negativeCashFlowPatterns = [
        /quarterly\s*cash\s*burn\s*(?:of|is|:)?\s*-?\$?([0-9.,MKmk]+)/i, // "quarterly cash burn of -$2.5M"
        /(?:based\s*on\s*)?quarterly\s*cash\s*burn\s*(?:of|is|:)?\s*-?\$?([0-9.,MKmk]+)/i,
        /(?:ttm\s*)?(?:free\s*)?cash\s*flow[:\s]*-?\$?([0-9.,MKmk]+)/i, // TTM FCF: -$13.48M
        /fcf[:\s]*-?\$?([0-9.,MKmk]+)/i,
        /(?:quarterly\s*)?(?:cash\s*)?burn\s*(?:rate)?[:\s]*-?\$?([0-9.,MKmk]+)/i,
        /burn\s*rate[:\s]*-?\$?([0-9.,MKmk]+)/i,
        /quarterly\s*burn[:\s]*-?\$?([0-9.,MKmk]+)/i,
        /-\$([0-9.,MKmk]+)\s*(?:million|M)/i,
      ];
      
      let foundNegative = false;
      for (const pattern of negativeCashFlowPatterns) {
        const match = fullText.match(pattern);
        if (match) {
          // Check if the matched text actually contains a negative sign
          const matchedText = match[0];
          if (matchedText.includes('-') || matchedText.toLowerCase().includes('burn')) {
            const parsed = parseDollarAmount('-' + match[1]);
            if (parsed && parsed < 0) {
              extracted.quarterlyBurnRate = parsed; // Negative burn rate
              foundNegative = true;
              break;
            }
          }
        }
      }
      
      // Only check for implicit positive cash flow if no negative was found
      if (!foundNegative) {
        const positiveCashFlowPatterns = [
          /(?:operating\s*)?cash\s*flow[:\s]*\+?\$?([0-9.MKmk]+)/i,
          /ocf[:\s]*\+?\$?([0-9.MKmk]+)/i,
        ];
        for (const pattern of positiveCashFlowPatterns) {
          const match = fullText.match(pattern);
          if (match) {
            const parsed = parseDollarAmount(match[1]);
            if (parsed && parsed > 0) {
              extracted.quarterlyBurnRate = parsed; // Positive value = positive cash flow
              break;
            }
          }
        }
      }
    }
    
    // Extract cash runway
    const runwayPatterns = [
      /cash\s*(?:runway|left)[:\s]*([0-9.]+)\s*(?:months?|mo)/i,
      /([0-9.]+)\s*(?:months?|mo)\s*(?:runway|cash|left)/i,
      /has\s+([0-9.]+)\s+months?\s+of\s+cash/i,
      /([0-9.]+)\s+months?\s+of\s+cash/i,
    ];
    for (const pattern of runwayPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        // Use the full match since parseMonths expects text with "months" keyword
        const parsed = parseMonths(match[0]);
        if (parsed) {
          extracted.cashRunway = parsed;
          break;
        }
      }
    }
    
    // Extract float and outstanding shares
    // Priority: Look for "Float & OS" pattern first, as it's more reliable
    // Format: "Float & OS: 27.64M / 34.47M" - get first number (float) and second (O/S)
    // NOTE: OCR may read "2.764M" as "27.64M" - we need to handle this case
    // If Float seems too large relative to O/S, it might be a decimal parsing issue
    // Make regex more flexible to handle various formats:
    // - "Float & OS: 27.64M / 34.47M" (OCR reads "OS" as uppercase, no slash)
    // - "Float & O/S: 27.64M / 34.47M" (with slash)
    // - "Float & O S: 27.64M / 34.47M" (with space)
    const floatOsPattern = /float\s*&?\s*o[\/\s]*s[:\s]*([0-9.,]+[MKmk]?)\s*\/\s*([0-9.,]+[MKmk]?)/i;
    const floatOsMatch = fullText.match(floatOsPattern);
    
    console.log(`OCR: Float/OS pattern match attempt. Pattern matched: ${!!floatOsMatch}`);
    if (floatOsMatch) {
      console.log(`OCR: Float/OS match found: "${floatOsMatch[0]}", groups: [${floatOsMatch[1]}, ${floatOsMatch[2]}]`);
      // Extract both Float and O/S from "Float & OS: X / Y"
      const floatStr = floatOsMatch[1];
      const osStr = floatOsMatch[2];
      
      console.log(`OCR: Parsing Float string: "${floatStr}", O/S string: "${osStr}"`);
      const floatParsed = parseNumberWithSuffix(floatStr);
      const osParsed = parseNumberWithSuffix(osStr);
      
      console.log(`OCR: Parsed values - Float: ${floatParsed}, O/S: ${osParsed}`);
      
      if (floatParsed && osParsed) {
        // Sanity check: Float should never exceed O/S
        // If float > O/S, likely a parsing error (e.g., "2.76M" read as "27.6M")
        // Check if float is significantly larger than O/S - if so, it's likely wrong
        const floatM = floatParsed < 1000 ? floatParsed : floatParsed / 1_000_000;
        const osM = osParsed < 1000 ? osParsed : osParsed / 1_000_000;
        
        if (floatM > osM * 1.1) {
          // Float exceeds O/S - likely parsing error
          // Common issue: "2.76M" OCR'd as "27.6M" (decimal point missed)
          // Try dividing by 10 as a correction
          const correctedFloat = floatParsed / 10;
          if (correctedFloat < osParsed) {
            console.warn(`OCR: Float parsing error detected. Float (${floatParsed}) > O/S (${osParsed}). Correcting to ${correctedFloat}`);
            extracted.float = correctedFloat;
            extracted.outstandingShares = osParsed;
          } else {
            // Still too large after correction, log warning but use original
            console.warn(`OCR: Float (${floatParsed}) exceeds O/S (${osParsed}) - possible OCR error, but correction failed`);
            extracted.float = floatParsed;
            extracted.outstandingShares = osParsed;
          }
        } else {
          // Normal case: float <= O/S
          extracted.float = floatParsed;
          extracted.outstandingShares = osParsed;
        }
        console.log(`OCR: Extracted Float=${extracted.float}, O/S=${extracted.outstandingShares}`);
      }
    } else {
      // Fallback: try individual patterns
      const floatPatterns = [
        /float[:\s]*([0-9.,]+[MKmk]?)/i,
        /float\s*shares?[:\s]*([0-9.,]+[MKmk]?)/i,
        /public\s*float[:\s]*([0-9.,]+[MKmk]?)/i,
      ];
      for (const pattern of floatPatterns) {
        const match = fullText.match(pattern);
        if (match) {
          const parsed = parseNumberWithSuffix(match[1]);
          if (parsed) {
            extracted.float = parsed;
            break;
          }
        }
      }
    }
    
    // Extract market cap
    const marketCapPatterns = [
      /market\s*cap[:\s]*\$?([0-9.MKmk]+)/i,
      /mkt\s*cap[:\s]*\$?([0-9.MKmk]+)/i,
      /market\s*cap\s*&?\s*ev[:\s]*\$?([0-9.MKmk]+)/i,
      /(?:mkt\s*cap|market\s*cap)[:\s]*\$?([0-9.MKmk]+)/i,
    ];
    for (const pattern of marketCapPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const parsed = parseDollarAmount(match[1]);
        if (parsed) {
          extracted.marketCap = parsed;
          break;
        }
      }
    }
    
    // Extract outstanding shares (only if not already extracted from Float & OS pattern)
    // Priority: Look for "total issued and outstanding shares" or "Major Developments" section first
    // This is more reliable than the summary Float & O/S line
    if (!extracted.outstandingShares) {
      const osPatterns = [
        /total\s*(?:issued\s*and\s*)?outstanding\s*shares?[:\s]*([0-9.,MKmk]+)/i, // "total issued and outstanding shares: 4,324,565"
        /outstanding\s*shares?\s*(?:are|of|total|:)\s*([0-9.,MKmk]+)/i, // "outstanding shares are 4,324,565"
        /(?:issued\s*and\s*)?outstanding\s*shares?[:\s]*([0-9.MKmk]+)/i,
        /o\/s[:\s]*([0-9.MKmk]+)/i,
        /shares?\s*(?:outstanding|o\/s)[:\s]*([0-9.MKmk]+)/i,
        /float\s*&?\s*o\/s[:\s]*[0-9.MKmk]+\s*\/\s*([0-9.MKmk]+)/i, // "Float & O/S 17.72M / 40.21M" - get second number
        /total\s*shares?\s*(?:outstanding)?[:\s]*([0-9.MKmk]+)/i,
      ];
      for (const pattern of osPatterns) {
        const match = fullText.match(pattern);
        if (match) {
          const parsed = parseNumberWithSuffix(match[1]);
          if (parsed) {
            extracted.outstandingShares = parsed;
            console.log(`OCR: Extracted O/S from fallback pattern: ${extracted.outstandingShares}`);
            break;
          }
        }
      }
    } else {
      console.log(`OCR: O/S already extracted from Float & OS pattern: ${extracted.outstandingShares}`);
    }
    
    // Extract all 5 DT card statuses
    extracted.atmShelfStatus = extractAtmShelfStatus(fullText);
    extracted.overheadSupplyStatus = extractOverheadSupplyStatus(fullText);
    extracted.cashNeedStatus = extractDTStatus(fullText, 'cash need');
    extracted.overallRiskStatus = extractDTStatus(fullText, 'overall risk');
    
    // Extract Historical Dilution - try multiple approaches
    // 1. Try standard extractDTStatus with variations
    extracted.historicalDilutionStatus = extractDTStatus(fullText, 'historical dilution') || 
                                         extractDTStatus(fullText, 'historical') ||
                                         extractDTStatus(fullText, 'historical:');
    
    // 2. Direct pattern match for "Historical:" followed by status (most common DT format)
    if (!extracted.historicalDilutionStatus) {
      const directPattern = /historical\s*[:]\s*(high|medium|low|red|yellow|green)\b/i;
      const directMatch = fullText.match(directPattern);
      if (directMatch) {
        extracted.historicalDilutionStatus = mapDTTag(directMatch[1].toLowerCase());
        console.log(`[OCR] Extracted Historical via direct pattern: ${extracted.historicalDilutionStatus}`);
      }
    }
    
    // 3. Pattern that matches Historical in context of the 5-card row
    // Look for pattern: "Historical" followed by colon/space and status, possibly with line breaks
    if (!extracted.historicalDilutionStatus) {
      const contextPattern = /historical[:\s\n]+(high|medium|low|red|yellow|green)\b/i;
      const contextMatch = fullText.match(contextPattern);
      if (contextMatch) {
        extracted.historicalDilutionStatus = mapDTTag(contextMatch[1].toLowerCase());
        console.log(`[OCR] Extracted Historical via context pattern: ${extracted.historicalDilutionStatus}`);
      }
    }
    
    // Debug: Check if Historical appears in text at all
    if (!extracted.historicalDilutionStatus) {
      const historicalMatches = fullText.match(/historical[:\s\n]+(high|medium|low|red|yellow|green)/i);
      if (historicalMatches) {
        console.log(`[OCR Debug] Found "Historical ${historicalMatches[1]}" but all extraction methods failed`);
        const histIndex = fullText.toLowerCase().indexOf('historical');
        if (histIndex !== -1) {
          const context = fullText.substring(Math.max(0, histIndex - 50), Math.min(fullText.length, histIndex + 100));
          console.log(`[OCR Debug] Context: ${context}`);
        }
      } else {
        console.log(`[OCR Debug] No "Historical" pattern found in OCR text`);
        // Check if "historical" word exists at all
        if (fullText.toLowerCase().includes('historical')) {
          const histIndex = fullText.toLowerCase().indexOf('historical');
          const context = fullText.substring(Math.max(0, histIndex - 50), Math.min(fullText.length, histIndex + 100));
          console.log(`[OCR Debug] Word "historical" found but no status pattern. Context: ${context}`);
        }
      }
    }
    
    // Debug: Log all extracted DT tags
    console.log('Extracted DT tags:');
    console.log('  - Offering Ability:', extracted.atmShelfStatus);
    console.log('  - Overhead Supply:', extracted.overheadSupplyStatus);
    console.log('  - Cash Need:', extracted.cashNeedStatus);
    console.log('  - Historical Dilution:', extracted.historicalDilutionStatus);
    console.log('  - Overall Risk:', extracted.overallRiskStatus);
    
    // Extract debt
    // IMPORTANT: DT screenshots typically don't show total debt explicitly
    // They show "Net Cash" which is Cash - Debt, so debt is hidden
    // Only extract if explicitly stated (not inferred from net cash)
    const debtPatterns = [
      /total\s*debt[:\s]*\$?([0-9.MKmk]+)/i,
      /(?:short[- ]?term|long[- ]?term)\s*debt[:\s]*\$?([0-9.MKmk]+)/i,
      /debt[:\s]*\$?([0-9.MKmk]+)/i, // More generic, but catch explicit debt mentions
    ];
    let foundExplicitDebt = false;
    for (const pattern of debtPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        // Make sure it's not in context of "net debt" or "net cash"
        const context = fullText.substring(Math.max(0, match.index! - 20), Math.min(fullText.length, match.index! + match[0].length + 20));
        if (!/net\s*(?:debt|cash)/i.test(context)) {
          const parsed = parseDollarAmount(match[1]);
          if (parsed) {
            extracted.debt = parsed;
            (extracted as any).hasActualDebtData = true;
            foundExplicitDebt = true;
            break;
          }
        }
      }
    }
    
    // If we found net cash but no explicit debt, mark that we don't have actual debt data
    if (foundNetCash && !foundExplicitDebt) {
      (extracted as any).hasActualDebtData = false;
      (extracted as any).debtCashSource = 'ocr'; // Mark that we only have OCR data (Net Cash)
    } else if (foundExplicitDebt) {
      (extracted as any).debtCashSource = 'ocr'; // Mark that we have debt from OCR
    }
    
    // Extract institutional ownership
    const instOwnPatterns = [
      /institutional\s*ownership[:\s]*([0-9.]+)\s*%/i,
      /inst\s*own[:\s]*([0-9.]+)\s*%/i,
    ];
    for (const pattern of instOwnPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const parsed = parsePercentage(match[0]);
        if (parsed !== null) {
          extracted.institutionalOwnership = parsed;
          break;
        }
      }
    }
    
    // Extract short interest
    const shortIntPatterns = [
      /short\s*interest[:\s]*([0-9.]+)\s*%/i,
      /si[:\s]*([0-9.]+)\s*%/i,
    ];
    for (const pattern of shortIntPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        const parsed = parsePercentage(match[0]);
        if (parsed !== null) {
          extracted.shortInterest = parsed;
          break;
        }
      }
    }
    
    // Detect price spike - first try to extract percentage from DT screenshot
    const priceSpikePct = extractPriceSpikeFromDT(fullText);
    if (priceSpikePct !== null) {
      // Store the percentage - will be used in scoring
      (extracted as any).priceSpikePct = priceSpikePct;
      // Also set boolean indicator if percentage is significant (>= 30%)
      extracted.priceSpike = priceSpikePct >= 30;
    } else {
      // Fallback to keyword detection
      extracted.priceSpike = detectPriceSpike(fullText);
    }
    
    // Extract news (prefer recent Major Developments within 7 days)
    const ocrNews = extractNews(fullText);
    if (ocrNews) {
      extracted.recentNews = ocrNews.headline;
      if (ocrNews.date) {
        (extracted as any).recentNewsDate = ocrNews.date;
      }
    }
    
    return extracted;
  } catch (error) {
    console.error('OCR extraction failed:', error);
    if (error instanceof Error) {
      console.error('OCR error details:', error.message, error.stack);
    }
    throw new Error(`OCR extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

