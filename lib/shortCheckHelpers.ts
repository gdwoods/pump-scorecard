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
    if (data.cashRunway < 0) {
      parts.push(`${tickerStr} has negative cash runway (${Math.abs(data.cashRunway).toFixed(1)} months)`);
    } else {
      parts.push(`${tickerStr} has only ${data.cashRunway.toFixed(1)} months of runway`);
    }
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
    'Droppiness': {
      title: 'Droppiness',
      explanation:
        'Measures how quickly price spikes fade after major moves. High droppiness (70+) indicates spikes fade quickly, which is favorable for short sellers as it shows weak support and tendency to revert. Low droppiness (<40) means spikes hold, indicating stronger support and higher risk for short positions.',
    },
  };

  return explanations[category] || {
    title: category,
    explanation: 'This metric contributes to the overall short setup assessment.',
  };
}

/** Short-side contribution band for at-a-glance score breakdown tiles (DT-aligned: High/Medium/Low). */
export type ScoreContributionLevel = 'high' | 'medium' | 'minimal' | 'low';

export function getScoreContributionLevel(
  value: number,
  max: number,
  min = 0
): ScoreContributionLevel {
  if (value < 0) return 'low';
  const range = max - min;
  if (range <= 0) return value > 0 ? 'medium' : 'minimal';
  const pct = ((value - min) / range) * 100;
  if (pct >= 75) return 'high';
  if (pct >= 40) return 'medium';
  return 'minimal';
}

export const SCORE_LEVEL_LABEL: Record<ScoreContributionLevel, string> = {
  high: 'High',
  medium: 'Medium',
  minimal: 'Minimal',
  low: 'Low',
};

export const SCORE_LEVEL_TOOLTIP: Record<ScoreContributionLevel, string> = {
  high: 'High contribution to the short rating on this factor.',
  medium: 'Moderate contribution to the short rating.',
  minimal: 'Small positive contribution — limited short edge from this factor.',
  low: 'Low contribution — negative points pull the rating down (same sense as DT Low/Green offering ability).',
};

export const SCORE_LEVEL_PILL_CLASS: Record<ScoreContributionLevel, string> = {
  high: 'bg-red-600 text-white',
  medium: 'bg-amber-500 text-white',
  minimal: 'bg-emerald-500 text-white',
  low: 'bg-emerald-700 text-white',
};

export const SCORE_LEVEL_TILE_CLASS: Record<ScoreContributionLevel, string> = {
  high: 'border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20',
  medium: 'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/15',
  minimal: 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10',
  low: 'border-emerald-300 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-950/25',
};

export interface ScoreBreakdownItem {
  label: string;
  value: number;
  max: number;
  min?: number;
  actualValue?: string;
  group: 'capital' | 'structure' | 'catalyst';
}

export function getScoreBreakdownItems(breakdown: ScoreBreakdown): ScoreBreakdownItem[] {
  return [
    { label: 'Droppiness', value: breakdown.droppiness, max: 12, min: -8, actualValue: breakdown.actualValues?.droppiness, group: 'structure' },
    { label: 'Overall Risk', value: breakdown.overallRisk, max: 10, actualValue: breakdown.actualValues?.overallRisk, group: 'catalyst' },
    { label: 'Cash Need', value: breakdown.cashNeed, max: 25, actualValue: breakdown.actualValues?.cashNeed, group: 'capital' },
    { label: 'Cash Runway', value: breakdown.cashRunway, max: 15, min: -10, actualValue: breakdown.actualValues?.cashRunway, group: 'capital' },
    { label: 'Offering Ability', value: breakdown.offeringAbility, max: 25, min: -30, actualValue: breakdown.actualValues?.offeringAbility, group: 'capital' },
    { label: 'Institutional Ownership', value: breakdown.institutionalOwnership, max: 5, min: -5, actualValue: breakdown.actualValues?.institutionalOwnership, group: 'structure' },
    { label: 'Float', value: breakdown.float, max: 10, min: -10, actualValue: breakdown.actualValues?.float, group: 'structure' },
    { label: 'Short Interest', value: breakdown.shortInterest, max: 15, min: -5, actualValue: breakdown.actualValues?.shortInterest, group: 'structure' },
    { label: 'Historical Dilution', value: breakdown.historicalDilution, max: 10, actualValue: breakdown.actualValues?.historicalDilution, group: 'capital' },
    { label: 'Debt/Cash Ratio', value: breakdown.debtToCash, max: 10, actualValue: breakdown.actualValues?.debtToCash, group: 'capital' },
    { label: 'Price Spike', value: breakdown.priceSpike, max: 10, actualValue: breakdown.actualValues?.priceSpike, group: 'catalyst' },
    { label: 'News Catalyst', value: breakdown.newsCatalyst, max: 15, min: -10, actualValue: breakdown.actualValues?.newsCatalyst, group: 'catalyst' },
  ];
}

/** Six tiles shown collapsed — mirrors AskEdgar risk grid scan pattern. */
export const SCORE_SUMMARY_LABELS = [
  'Overall Risk',
  'Offering Ability',
  'Cash Need',
  'Historical Dilution',
  'Float',
  'Droppiness',
] as const;

export function getTopScoreDrivers(items: ScoreBreakdownItem[], limit = 3): ScoreBreakdownItem[] {
  return [...items]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, limit);
}

/** DilutionTracker badge band (High / Medium / Low). */
export type DtRiskBand = 'high' | 'medium' | 'low';

export interface DtBadgeStat {
  label: string;
  band: DtRiskBand;
  rawStatus?: string;
}

export const DT_RISK_BAND_LABEL: Record<DtRiskBand, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const DT_RISK_PILL_CLASS: Record<DtRiskBand, string> = {
  high: 'bg-red-600 text-white',
  medium: 'bg-amber-500 text-white',
  low: 'bg-emerald-700 text-white',
};

export const DT_RISK_TILE_CLASS: Record<DtRiskBand, string> = {
  high: 'border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20',
  medium: 'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/15',
  low: 'border-emerald-300 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-950/25',
};

export function parseDtBandFromStatus(
  rawStatus: string | undefined,
  mode: 'simple' | 'offering' = 'simple'
): DtRiskBand | null {
  if (!rawStatus) return null;
  const status = rawStatus.replace(/^DT:/i, '').trim().toLowerCase();

  if (mode === 'offering') {
    if (status.includes('red') || status.includes('high') || status.includes('active')) return 'high';
    if (status.includes('yellow') || status.includes('medium')) return 'medium';
    if (status.includes('green') || status.includes('low')) return 'low';
    if (
      status.includes('atm') ||
      status.includes('s-1') ||
      status.includes('equity line') ||
      status.includes('convertible')
    ) {
      return 'high';
    }
    return 'low';
  }

  const head = status.split(/[\s—\-|(/]/)[0]?.trim();
  if (head === 'red' || head === 'high') return 'high';
  if (head === 'yellow' || head === 'medium') return 'medium';
  if (head === 'green' || head === 'low') return 'low';
  return null;
}

/** DT badge row in DilutionTracker order (5 metrics). */
export function buildDtBadgeStats(data: ExtractedData): DtBadgeStat[] {
  const stats: DtBadgeStat[] = [];

  if (data.overallRiskStatus) {
    const band = parseDtBandFromStatus(data.overallRiskStatus);
    if (band) stats.push({ label: 'Overall Risk', band, rawStatus: data.overallRiskStatus });
  }
  if (data.atmShelfStatus) {
    const band = parseDtBandFromStatus(data.atmShelfStatus, 'offering');
    if (band) stats.push({ label: 'Offering Ability', band, rawStatus: data.atmShelfStatus });
  }
  if (data.overheadSupplyStatus) {
    const band = parseDtBandFromStatus(data.overheadSupplyStatus);
    if (band) stats.push({ label: 'Overhead Supply', band, rawStatus: data.overheadSupplyStatus });
  }
  if (data.historicalDilutionStatus) {
    const band = parseDtBandFromStatus(data.historicalDilutionStatus);
    if (band) stats.push({ label: 'Historical', band, rawStatus: data.historicalDilutionStatus });
  }
  if (data.cashNeedStatus) {
    const band = parseDtBandFromStatus(data.cashNeedStatus);
    if (band) stats.push({ label: 'Cash Need', band, rawStatus: data.cashNeedStatus });
  }

  return stats;
}

const DT_BADGE_EXTRA_TOOLTIPS: Record<string, string> = {
  'Overhead Supply':
    'Warrants, convertibles, and other shares hanging over the float — high overhead increases dilution pressure.',
};

export function getDtBadgeTooltip(label: string): string {
  if (DT_BADGE_EXTRA_TOOLTIPS[label]) return DT_BADGE_EXTRA_TOOLTIPS[label];
  const mapped =
    label === 'Historical' ? 'Historical Dilution' : label === 'Cash Need' ? 'Cash Need' : label;
  return getCategoryExplanation(mapped).explanation;
}

