// lib/shortCheckHelpers.ts
import { ExtractedData } from './shortCheckTypes';
import { ScoreBreakdown } from './shortCheckScoring';

export interface RedFlagTag {
  icon: string;
  label: string;
  color: 'red' | 'orange' | 'yellow';
  tooltip: string;
}

export interface CategoryExplanation {
  title: string;
  explanation: string;
}

/**
 * Get red flag tags for each score category
 */
export function getRedFlagTags(
  category: string,
  breakdown: ScoreBreakdown,
  data: ExtractedData
): RedFlagTag | null {
  switch (category) {
    case 'Cash Runway': {
      const runway = data.cashRunway;
      if (runway !== undefined && runway < 3) {
        return {
          icon: '🔴',
          label: 'Urgent',
          color: 'red',
          tooltip: 'Company may need to raise capital imminently',
        };
      }
      return null;
    }

    case 'Offering Ability': {
      const status = data.atmShelfStatus?.toLowerCase() || '';
      if (
        status.includes('atm active') ||
        status.includes('active atm') ||
        status.includes('active dilution') ||
        status.includes('equity line') ||
        status.includes('share purchase agreement')
      ) {
        return {
          icon: '🧨',
          label: 'Active Shelf',
          color: 'red',
          tooltip: 'ATM/S-1 in place; capable of issuing shares',
        };
      }
      if (status.includes('s-1') || status.includes('shelf')) {
        return {
          icon: '⚠️',
          label: 'Shelf Filed',
          color: 'orange',
          tooltip: 'S-1/Shelf filed but not yet active',
        };
      }
      return null;
    }

    case 'Institutional Ownership': {
      const instOwn = data.institutionalOwnership;
      if (instOwn !== undefined && instOwn < 2) {
        return {
          icon: '⚠️',
          label: 'Weak Support',
          color: 'yellow',
          tooltip: 'Minimal institutional confidence',
        };
      }
      return null;
    }

    case 'Float': {
      let floatShares = data.float;
      if (floatShares !== undefined) {
        if (floatShares < 1000) floatShares = floatShares * 1_000_000;
        if (floatShares < 5_000_000) {
          return {
            icon: '🎈',
            label: 'Thin Float',
            color: 'orange',
            tooltip: 'Higher volatility risk',
          };
        }
      }
      return null;
    }

    case 'Short Interest': {
      const shortInt = data.shortInterest;
      if (shortInt !== undefined && shortInt > 6) {
        return {
          icon: '📈',
          label: 'Elevated',
          color: 'orange',
          tooltip: 'Bearish positioning is already underway',
        };
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Generate risk synopsis text
 */
export function generateRiskSynopsis(
  ticker: string | undefined,
  breakdown: ScoreBreakdown,
  data: ExtractedData
): string {
  const tickerStr = ticker || 'This company';
  const parts: string[] = [];

  // Cash runway
  if (data.cashRunway !== undefined) {
    parts.push(`${tickerStr} has only ${data.cashRunway.toFixed(1)} months of runway`);
  }

  // Dilution tools
  const hasActiveDilution =
    data.atmShelfStatus &&
    (data.atmShelfStatus.toLowerCase().includes('active') ||
      data.atmShelfStatus.toLowerCase().includes('atm') ||
      data.atmShelfStatus.toLowerCase().includes('equity line'));
  const hasShelf =
    data.atmShelfStatus &&
    (data.atmShelfStatus.toLowerCase().includes('s-1') ||
      data.atmShelfStatus.toLowerCase().includes('shelf'));

  if (hasActiveDilution || hasShelf) {
    if (hasActiveDilution && hasShelf) {
      parts.push('multiple active dilution tools');
    } else if (hasActiveDilution) {
      parts.push('active dilution tools');
    } else {
      parts.push('dilution tools available');
    }
  }

  // Float
  if (data.float !== undefined) {
    let floatShares = data.float;
    if (floatShares < 1000) floatShares = floatShares * 1_000_000;
    parts.push(`a float of ${(floatShares / 1_000_000).toFixed(2)}M shares`);
  }

  // Institutional ownership
  if (data.institutionalOwnership !== undefined) {
    parts.push(`institutional ownership of just ${data.institutionalOwnership.toFixed(1)}%`);
  }

  // Short interest
  if (data.shortInterest !== undefined && data.shortInterest > 6) {
    parts.push(`elevated short interest of ${data.shortInterest.toFixed(1)}%`);
  }

  // Combine parts
  if (parts.length === 0) {
    return `${tickerStr} presents a mixed risk profile based on the analyzed factors.`;
  }

  let synopsis = parts[0];
  if (parts.length === 2) {
    synopsis += ` and ${parts[1]}`;
  } else if (parts.length > 2) {
    synopsis += `, ${parts.slice(1, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  }

  synopsis += '.';
  
  // Add closing statement if multiple risk factors
  if (parts.length >= 2) {
    synopsis += ' It may face selling pressure and increased volatility.';
  }

  return synopsis;
}

/**
 * Get explanation for each category
 */
export function getCategoryExplanation(category: string): CategoryExplanation {
  const explanations: Record<string, CategoryExplanation> = {
    'Cash Need': {
      title: 'Cash Need',
      explanation:
        'Companies with <3 months of runway often raise capital via dilutive offerings, which can depress share price.',
    },
    'Cash Runway': {
      title: 'Cash Runway',
      explanation:
        'Companies with <3 months of runway often raise capital via dilutive offerings, which can depress share price.',
    },
    'Offering Ability': {
      title: 'Offering Ability',
      explanation:
        'A shelf or ATM allows the company to issue shares rapidly, increasing supply and downward price pressure.',
    },
    'Historical Dilution': {
      title: 'Historical Dilution',
      explanation:
        'Companies that have significantly increased shares outstanding show a pattern of shareholder dilution, indicating likely future dilution.',
    },
    'Institutional Ownership': {
      title: 'Institutional Ownership',
      explanation:
        'Low institutional ownership suggests limited professional interest and support, increasing vulnerability to selling pressure.',
    },
    'Short Interest': {
      title: 'Short Interest',
      explanation:
        'Elevated short interest indicates bearish sentiment is already priced in, but also creates potential for short squeezes if catalysts emerge.',
    },
    'News Catalyst': {
      title: 'News Catalyst',
      explanation:
        'Strong positive news can drive price appreciation, making short positions risky. Lack of bullish catalysts favors short setups.',
    },
    'Float': {
      title: 'Float',
      explanation:
        'Low float stocks are more volatile and susceptible to price manipulation, but also create higher risk/reward for short positions.',
    },
    'Overall Risk': {
      title: 'Overall Risk',
      explanation:
        'Combines multiple risk factors including cash position, dilution mechanisms, and market structure to assess overall short setup quality.',
    },
    'Price Spike': {
      title: 'Price Spike',
      explanation:
        'Recent price spikes may indicate speculative interest, but often represent overextension that creates attractive short entry points.',
    },
    'Debt/Cash Ratio': {
      title: 'Debt/Cash Ratio',
      explanation:
        'High debt relative to cash increases financial stress and the likelihood of dilutive capital raises to meet obligations.',
    },
  };

  return explanations[category] || {
    title: category,
    explanation: 'This metric contributes to the overall short setup assessment.',
  };
}

