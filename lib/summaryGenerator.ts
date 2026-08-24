// lib/summaryGenerator.ts
// Generate formatted text summaries for clipboard export

import { ShortCheckResult } from './shortCheckScoring';
import { ExtractedData } from './shortCheckTypes';
import { generateRiskSynopsis } from './shortCheckHelpers';

interface SummaryOptions {
  ticker: string;
  result: ShortCheckResult;
  extractedData?: ExtractedData;
  pumpScorecardData?: any;
  format: 'quick' | 'full';
}

export function generateFormattedSummary(options: SummaryOptions): string {
  const { ticker, result, extractedData, pumpScorecardData, format } = options;

  if (format === 'quick') {
    return generateQuickSummary(ticker, result, extractedData, pumpScorecardData);
  } else {
    return generateFullSummary(ticker, result, extractedData, pumpScorecardData);
  }
}

function generateQuickSummary(
  ticker: string,
  result: ShortCheckResult,
  extractedData?: ExtractedData,
  pumpScorecardData?: any
): string {
  const lines: string[] = [];

  lines.push(`SHORT CHECK - ${ticker.toUpperCase()}`);
  lines.push(`Rating: ${result.rating.toFixed(1)}% | ${result.category}`);
  lines.push('');

  // Alert Labels
  if (result.alertLabels && result.alertLabels.length > 0) {
    lines.push('Key Alerts:');
    result.alertLabels.forEach(alert => {
      const icon = alert.color === 'red' ? '🔴' : alert.color === 'orange' ? '🟠' : '🟡';
      lines.push(`${icon} ${alert.label}`);
    });
    lines.push('');
  }

  // Top Score Factors
  const breakdown = result.scoreBreakdown;
  const factors = [
    { name: 'Offering Ability', value: breakdown.offeringAbility },
    { name: 'Droppiness', value: breakdown.droppiness },
    { name: 'Float', value: breakdown.float },
    { name: 'Cash Need', value: breakdown.cashNeed },
    { name: 'Overall Risk', value: breakdown.overallRisk },
  ].filter(f => f.value !== undefined && f.value !== 0)
    .sort((a, b) => Math.abs(b.value || 0) - Math.abs(a.value || 0))
    .slice(0, 5);

  if (factors.length > 0) {
    lines.push('Top Factors:');
    factors.forEach(factor => {
      const sign = (factor.value || 0) > 0 ? '+' : '';
      lines.push(`• ${factor.name}: ${sign}${factor.value?.toFixed(1)}`);
    });
    lines.push('');
  }

  // Key Metrics
  if (extractedData) {
    lines.push('Key Metrics:');
    if (extractedData.cashRunway) {
      lines.push(`• Cash Runway: ${extractedData.cashRunway} months`);
    }
    if (extractedData.float) {
      lines.push(`• Float: ${(extractedData.float / 1e6).toFixed(2)}M shares`);
    }
    if (extractedData.institutionalOwnership !== undefined) {
      lines.push(`• Institutional Ownership: ${extractedData.institutionalOwnership}%`);
    }
    if (extractedData.currentPrice !== undefined) {
      lines.push(`• Current Price: $${extractedData.currentPrice.toFixed(2)}`);
    }
    lines.push('');
  }

  // Risk Synopsis (first sentence only for quick)
  if (extractedData) {
    const synopsis = generateRiskSynopsis(ticker, breakdown, extractedData);
    const firstSentence = synopsis.split('.')[0];
    if (firstSentence) {
      lines.push(`Summary: ${firstSentence}.`);
      lines.push('');
    }
  }

  // Walk-Away Flags
  if (result.walkAwayFlags && result.walkAwayFlags.length > 0) {
    lines.push('⚠️ Walk-Away Flags:');
    result.walkAwayFlags.forEach(flag => lines.push(`• ${flag}`));
    lines.push('');
  }

  // Droppiness (if available)
  if (pumpScorecardData?.droppinessScore !== undefined) {
    lines.push(`Droppiness: ${pumpScorecardData.droppinessScore} - ${pumpScorecardData.droppinessVerdict || 'N/A'}`);
    lines.push('');
  }

  // Capital Pressure (if available)
  if (pumpScorecardData?.capitalPressure) {
    const cp = pumpScorecardData.capitalPressure;
    if (cp.available === false) {
      lines.push(`Capital Pressure: unavailable — ${cp.unavailableReason || 'SEC not verified'}`);
    } else {
      lines.push(
        `Capital Pressure: ${cp.score}/100 (${cp.status}) · dilution ${cp.dilutionLikelihood}/10 · exec risk ${cp.shortExecutionRisk}/10`
      );
      if (cp.summary) lines.push(cp.summary);
    }
    lines.push('');
  }

  // Pump Risk (if available)
  if (pumpScorecardData?.weightedRiskScore !== undefined) {
    lines.push(`Pump Risk: ${pumpScorecardData.weightedRiskScore.toFixed(1)} - ${pumpScorecardData.summaryVerdict || 'N/A'}`);
  }

  return lines.join('\n');
}

function generateFullSummary(
  ticker: string,
  result: ShortCheckResult,
  extractedData?: ExtractedData,
  pumpScorecardData?: any
): string {
  const lines: string[] = [];
  const separator = '═══════════════════════════════════════════════════════';
  const subSeparator = '─────────────────────────────────────────────';

  // Header
  lines.push(separator);
  lines.push(`SHORT CHECK ANALYSIS - ${ticker.toUpperCase()}`);
  lines.push(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push(separator);
  lines.push('');

  // Overall Rating
  lines.push('OVERALL RATING:');
  lines.push(`${result.rating.toFixed(1)}%`);
  lines.push(`Category: ${result.category}`);
  lines.push('');

  // Alert Labels
  if (result.alertLabels && result.alertLabels.length > 0) {
    lines.push('ALERT LABELS:');
    result.alertLabels.forEach(alert => {
      const icon = alert.color === 'red' ? '🔴' : alert.color === 'orange' ? '🟠' : '🟡';
      lines.push(`${icon} ${alert.label}`);
    });
    lines.push('');
  }

  // Risk Synopsis
  if (extractedData) {
    lines.push('RISK SYNOPSIS:');
    lines.push(generateRiskSynopsis(ticker, result.scoreBreakdown, extractedData));
    lines.push('');
  }

  // Score Breakdown
  lines.push('SCORE BREAKDOWN:');
  const breakdown = result.scoreBreakdown;
  const breakdownItems = [
    { label: 'Droppiness', value: breakdown.droppiness },
    { label: 'Overall Risk', value: breakdown.overallRisk },
    { label: 'Cash Need', value: breakdown.cashNeed },
    { label: 'Cash Runway', value: breakdown.cashRunway },
    { label: 'Offering Ability', value: breakdown.offeringAbility },
    { label: 'Institutional Ownership', value: breakdown.institutionalOwnership },
    { label: 'Float', value: breakdown.float },
    { label: 'Short Interest', value: breakdown.shortInterest },
    { label: 'Historical Dilution', value: breakdown.historicalDilution },
    { label: 'Debt/Cash Ratio', value: (breakdown as any).debtCashRatio },
    { label: 'Price Spike', value: breakdown.priceSpike },
    { label: 'News Catalyst', value: breakdown.newsCatalyst },
  ];

  breakdownItems.forEach(item => {
    if (item.value !== undefined) {
      const sign = item.value > 0 ? '+' : '';
      lines.push(`${item.label}: ${sign}${item.value.toFixed(1)}`);
    }
  });
  lines.push(subSeparator);
  lines.push(`Total: ${result.rating.toFixed(1)}%`);
  lines.push('');

  // Key Metrics
  if (extractedData) {
    lines.push('KEY METRICS:');
    if (extractedData.cashRunway) {
      lines.push(`• Cash Runway: ${extractedData.cashRunway} months`);
    }
    if (extractedData.float) {
      lines.push(`• Float: ${(extractedData.float / 1e6).toFixed(2)}M shares`);
    }
    if (extractedData.institutionalOwnership !== undefined) {
      lines.push(`• Institutional Ownership: ${extractedData.institutionalOwnership}%`);
    }
    if (extractedData.currentPrice !== undefined) {
      lines.push(`• Current Price: $${extractedData.currentPrice.toFixed(2)}`);
    }
    lines.push('');
  }

  // Walk-Away Flags
  if (result.walkAwayFlags && result.walkAwayFlags.length > 0) {
    lines.push('WALK-AWAY FLAGS:');
    result.walkAwayFlags.forEach(flag => lines.push(`• ${flag}`));
    lines.push('');
  }

  // Alert Card
  if (result.alertCard) {
    lines.push('ALERT CARD:');
    lines.push(subSeparator);
    lines.push(result.alertCard);
    lines.push('');
  }

  // PUMP SCORECARD SECTION
  if (pumpScorecardData) {
    lines.push('');
    lines.push(separator);
    lines.push('PUMP SCORECARD ANALYSIS');
    lines.push(separator);
    lines.push('');

    // Droppiness
    if (pumpScorecardData.droppinessScore !== undefined) {
      lines.push('DROPPINESS SCORE:');
      lines.push(`Score: ${pumpScorecardData.droppinessScore}`);
      if (pumpScorecardData.droppinessVerdict) {
        lines.push(`Verdict: ${pumpScorecardData.droppinessVerdict}`);
      }
      if (pumpScorecardData.droppinessDetail && pumpScorecardData.droppinessDetail.length > 0) {
        lines.push(`Spike History: ${pumpScorecardData.droppinessDetail.length} spikes analyzed`);
      }
      lines.push('');
    }

    // Pump Risk Scorecard
    if (pumpScorecardData.weightedRiskScore !== undefined) {
      lines.push('PUMP RISK SCORECARD:');
      lines.push(`Weighted Risk Score: ${pumpScorecardData.weightedRiskScore.toFixed(1)}`);
      if (pumpScorecardData.summaryVerdict) {
        lines.push(`Verdict: ${pumpScorecardData.summaryVerdict}`);
      }
      if (pumpScorecardData.summaryText) {
        lines.push(pumpScorecardData.summaryText);
      }
      lines.push('');
    }

    // Fundamentals
    if (pumpScorecardData.marketCap || pumpScorecardData.floatShares) {
      lines.push('FUNDAMENTALS:');
      if (pumpScorecardData.marketCap) {
        lines.push(`• Market Cap: $${(pumpScorecardData.marketCap / 1e9).toFixed(2)}B`);
      }
      if (pumpScorecardData.floatShares) {
        lines.push(`• Float: ${(pumpScorecardData.floatShares / 1e6).toFixed(2)}M shares`);
      }
      if (pumpScorecardData.sharesOutstanding) {
        lines.push(`• Shares Outstanding: ${(pumpScorecardData.sharesOutstanding / 1e6).toFixed(2)}M`);
      }
      if (pumpScorecardData.shortFloat !== undefined) {
        lines.push(`• Short Float: ${pumpScorecardData.shortFloat.toFixed(1)}%`);
      }
      if (pumpScorecardData.institutionalOwnership !== undefined) {
        lines.push(`• Institutional Ownership: ${pumpScorecardData.institutionalOwnership.toFixed(1)}%`);
      }
      if (pumpScorecardData.insiderOwnership !== undefined) {
        lines.push(`• Insider Ownership: ${pumpScorecardData.insiderOwnership.toFixed(1)}%`);
      }
      if (pumpScorecardData.country) {
        lines.push(`• Country: ${pumpScorecardData.country}`);
      }
      if (pumpScorecardData.exchange) {
        lines.push(`• Exchange: ${pumpScorecardData.exchange}`);
      }
      if (pumpScorecardData.avgVolume) {
        lines.push(`• Avg Volume: ${(pumpScorecardData.avgVolume / 1e6).toFixed(2)}M`);
      }
      lines.push('');
    }

    // SEC Filings
    if (pumpScorecardData.filings && pumpScorecardData.filings.length > 0) {
      lines.push('RECENT SEC FILINGS:');
      pumpScorecardData.filings.slice(0, 10).forEach((filing: any) => {
        lines.push(`• ${filing.title || 'Filing'} - ${filing.date || 'Unknown date'}`);
      });
      lines.push('');
    }

    // Capital Pressure
    if (pumpScorecardData.capitalPressure) {
      const cp = pumpScorecardData.capitalPressure;
      lines.push('CAPITAL PRESSURE:');
      if (cp.available === false) {
        lines.push(`Unavailable — ${cp.unavailableReason || 'SEC filings could not be verified'}`);
        lines.push('(Missing data is not a risk signal.)');
      } else {
        lines.push(`Score: ${cp.score}/100 — ${cp.status}`);
        lines.push(`Dilution likelihood: ${cp.dilutionLikelihood}/10`);
        lines.push(`Short execution risk: ${cp.shortExecutionRisk}/10 (execution risk, not a bullish signal)`);
        if (cp.summary) lines.push(cp.summary);
        if (cp.capacity?.status === 'unknown') {
          lines.push('• Capacity: Not verified from available filings');
        } else if (cp.capacity?.description) {
          lines.push(`• Capacity (${cp.capacity.status}): ${cp.capacity.description}`);
        }
        if (cp.recentIssuance?.status === 'unknown') {
          lines.push('• Recent issuance: Not verified from available filings');
        } else if (cp.recentIssuance) {
          lines.push(
            `• Recent issuance 30d: ${cp.recentIssuance.shares30d ?? '—'} shares` +
              (cp.recentIssuance.proceeds30dUsd != null
                ? ` / $${cp.recentIssuance.proceeds30dUsd}`
                : '')
          );
        }
        if (cp.reasons?.length) {
          lines.push('Top reasons:');
          cp.reasons.slice(0, 5).forEach((r: { label: string; points: number }) => {
            lines.push(`  +${r.points}: ${r.label}`);
          });
        }
        if (cp.events?.length) {
          lines.push(`Timeline events: ${cp.events.length} (see UI for SEC links)`);
        }
      }
      lines.push('');
    }

    // Promotions
    const recentPromos = pumpScorecardData.recentPromotions || [];
    const olderPromos = pumpScorecardData.olderPromotions || [];
    if (recentPromos.length > 0 || olderPromos.length > 0) {
      lines.push('STOCK PROMOTIONS:');
      if (recentPromos.length > 0) {
        lines.push(`Recent (${recentPromos.length}):`);
        recentPromos.slice(0, 5).forEach((promo: any) => {
          lines.push(`  • ${promo.type || 'Promotion'} - ${promo.date || 'Unknown'}`);
        });
      }
      if (olderPromos.length > 0) {
        lines.push(`Older (${olderPromos.length}):`);
        olderPromos.slice(0, 5).forEach((promo: any) => {
          lines.push(`  • ${promo.type || 'Promotion'} - ${promo.date || 'Unknown'}`);
        });
      }
      lines.push('');
    }

    // Fraud Evidence
    const fraudItems = Array.isArray(pumpScorecardData.fraudImages)
      ? pumpScorecardData.fraudImages.filter(
        (item: any) => (item?.caption || '').toLowerCase() !== 'manual check'
      )
      : [];

    if (fraudItems.length > 0) {
      lines.push('FRAUD EVIDENCE:');
      lines.push(`Found ${fraudItems.length} fraud evidence image(s)`);
      fraudItems.slice(0, 5).forEach((item: any) => {
        lines.push(`• ${item.caption || 'Fraud evidence'}`);
      });
      lines.push('');
    }

    // News
    if (pumpScorecardData.news && Array.isArray(pumpScorecardData.news) && pumpScorecardData.news.length > 0) {
      lines.push('RECENT NEWS:');
      pumpScorecardData.news.slice(0, 10).forEach((item: any) => {
        const headline = item.headline || item.title || 'News';
        const date = item.date || item.pubDate || 'Unknown date';
        lines.push(`• ${headline} - ${date}`);
      });
      lines.push('');
    }

    // Borrow Desk
    if (pumpScorecardData.borrowData) {
      lines.push('BORROW DESK DATA:');
      if (pumpScorecardData.borrowData.fee !== undefined) {
        lines.push(`• Borrow Fee: ${pumpScorecardData.borrowData.fee}%`);
      }
      if (pumpScorecardData.borrowData.available !== undefined) {
        lines.push(`• Available: ${pumpScorecardData.borrowData.available.toLocaleString()} shares`);
      }
      lines.push('');
    }
  }

  lines.push(subSeparator);
  lines.push(`Generated by Short Check • ${new Date().toLocaleDateString()}`);

  return lines.join('\n');
}

