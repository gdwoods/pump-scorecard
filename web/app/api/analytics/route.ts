import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic'; // Ensure fresh data on each request

interface RiskDistribution {
  ranges: Array<{
    min: number;
    max: number;
    label: string;
    count: number;
    percentage: number;
  }>;
  average: number;
  median: number;
  total: number;
}

interface OfferingTrend {
  period: string;
  total_amount: number;
  average_amount: number;
  filing_count: number;
  min_amount: number;
  max_amount: number;
}

interface FilingSequence {
  ticker: string;
  filings: Array<{
    id: number;
    form_type: string;
    date: string;
    filing_datetime: string | null;
    link_to_filing: string | null;
    risk_score: number;
    base_offering_amount: string | null;
  }>;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type'); // 'risk-distribution', 'offering-trends', 'filing-sequence'
    const daysBack = searchParams.get('daysBack');
    const ticker = searchParams.get('ticker');

    // Build base query - filter out UNKNOWN tickers
    let baseQuery = supabase
      .from('sec_filing_alerts')
      .select('*')
      .neq('ticker', 'UNKNOWN');

    // Apply date filter if specified
    if (daysBack) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(daysBack));
      baseQuery = baseQuery.gte('date', daysAgo.toISOString().split('T')[0]);
    }

    // Apply ticker filter if specified (for filing sequence)
    if (ticker) {
      baseQuery = baseQuery.eq('ticker', ticker.toUpperCase());
    }

    const { data: alerts, error } = await baseQuery;

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch analytics data', details: error.message },
        { status: 500 }
      );
    }

    if (!alerts || alerts.length === 0) {
      return NextResponse.json({
        riskDistribution: { ranges: [], average: 0, median: 0, total: 0 },
        offeringTrends: [],
        filingSequences: [],
      });
    }

    // Risk Score Distribution
    if (type === 'risk-distribution' || !type) {
      const riskDistribution = calculateRiskDistribution(alerts);
      
      if (type === 'risk-distribution') {
        return NextResponse.json({ riskDistribution });
      }
    }

    // Offering Amount Trends
    if (type === 'offering-trends' || !type) {
      const offeringTrends = calculateOfferingTrends(alerts);
      
      if (type === 'offering-trends') {
        return NextResponse.json({ offeringTrends });
      }
    }

    // Filing Sequences
    if (type === 'filing-sequence' || !type) {
      const filingSequences = calculateFilingSequences(alerts, ticker);
      
      if (type === 'filing-sequence') {
        return NextResponse.json({ filingSequences });
      }
    }

    // Return all analytics if no type specified
    const riskDistribution = calculateRiskDistribution(alerts);
    const offeringTrends = calculateOfferingTrends(alerts);
    const filingSequences = calculateFilingSequences(alerts, ticker || undefined);

    return NextResponse.json({
      riskDistribution,
      offeringTrends,
      filingSequences,
    });
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function calculateRiskDistribution(alerts: any[]): RiskDistribution {
  // Define risk score ranges
  const ranges = [
    { min: 0, max: 5, label: '0-5' },
    { min: 5, max: 10, label: '5-10' },
    { min: 10, max: 15, label: '10-15' },
    { min: 15, max: 20, label: '15-20' },
    { min: 20, max: 100, label: '20+' },
  ];

  const validScores = alerts
    .map(a => a.risk_score)
    .filter((score): score is number => typeof score === 'number' && !isNaN(score));

  const total = validScores.length;
  const average = total > 0 ? validScores.reduce((sum, score) => sum + score, 0) / total : 0;
  const sorted = [...validScores].sort((a, b) => a - b);
  const median = total > 0
    ? total % 2 === 0
      ? (sorted[total / 2 - 1] + sorted[total / 2]) / 2
      : sorted[Math.floor(total / 2)]
    : 0;

  const rangeCounts = ranges.map(range => {
    const count = validScores.filter(
      score => score >= range.min && score < range.max
    ).length;
    return {
      ...range,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    };
  });

  return {
    ranges: rangeCounts,
    average: Math.round(average * 10) / 10,
    median: Math.round(median * 10) / 10,
    total,
  };
}

function calculateOfferingTrends(alerts: any[]): OfferingTrend[] {
  // Group by month
  const byMonth = new Map<string, any[]>();

  alerts.forEach(alert => {
    if (!alert.date) return;
    
    // Parse date and get month key (YYYY-MM)
    const date = new Date(alert.date);
    if (isNaN(date.getTime())) return;
    
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, []);
    }
    byMonth.get(monthKey)!.push(alert);
  });

  const trends: OfferingTrend[] = [];

  byMonth.forEach((monthAlerts, monthKey) => {
    // Extract offering amounts (use base_offering_amount or cap_raise_amount)
    const amounts = monthAlerts
      .map(a => {
        const amountStr = a.base_offering_amount || a.cap_raise_amount || a.offering_amount;
        if (!amountStr) return null;
        
        // Parse amount string (remove $ and commas)
        const num = parseFloat(amountStr.toString().replace(/[$,]/g, ''));
        return isNaN(num) ? null : num;
      })
      .filter((amount): amount is number => amount !== null && amount > 0);

    if (amounts.length === 0) return;

    const total_amount = amounts.reduce((sum, amount) => sum + amount, 0);
    const average_amount = total_amount / amounts.length;
    const min_amount = Math.min(...amounts);
    const max_amount = Math.max(...amounts);

    // Format period as "Jan 2024"
    const [year, month] = monthKey.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const period = `${monthNames[parseInt(month) - 1]} ${year}`;

    trends.push({
      period,
      total_amount,
      average_amount,
      filing_count: amounts.length,
      min_amount,
      max_amount,
    });
  });

  // Sort by period (chronologically)
  return trends.sort((a, b) => {
    const dateA = new Date(a.period);
    const dateB = new Date(b.period);
    return dateA.getTime() - dateB.getTime();
  });
}

function calculateFilingSequences(alerts: any[], ticker?: string): FilingSequence[] {
  // Group by ticker
  const byTicker = new Map<string, any[]>();

  alerts.forEach(alert => {
    if (!alert.ticker || alert.ticker === 'UNKNOWN') return;
    
    const tickerKey = alert.ticker.toUpperCase();
    if (!byTicker.has(tickerKey)) {
      byTicker.set(tickerKey, []);
    }
    byTicker.get(tickerKey)!.push(alert);
  });

  const sequences: FilingSequence[] = [];

  byTicker.forEach((tickerAlerts, tickerKey) => {
    // Filter for relevant form types (S-1, S-1/A, S-3, S-3/A, EFFECT, 424B4, 424B5)
    const relevantForms = ['S-1', 'S-1/A', 'S-3', 'S-3/A', 'EFFECT', 'EFFECT-U', '424B4', '424B5'];
    const relevantAlerts = tickerAlerts.filter(a => 
      relevantForms.some(form => a.form_type?.includes(form))
    );

    if (relevantAlerts.length === 0) return;

    // Sort by date (chronologically)
    const sorted = relevantAlerts.sort((a, b) => {
      const dateA = a.filing_datetime ? new Date(a.filing_datetime) : new Date(a.date + 'T00:00:00');
      const dateB = b.filing_datetime ? new Date(b.filing_datetime) : new Date(b.date + 'T00:00:00');
      return dateA.getTime() - dateB.getTime();
    });

    sequences.push({
      ticker: tickerKey,
      filings: sorted.map(a => ({
        id: a.id,
        form_type: a.form_type || '',
        date: a.date || '',
        filing_datetime: a.filing_datetime || null,
        link_to_filing: a.link_to_filing || null,
        risk_score: a.risk_score || 0,
        base_offering_amount: a.base_offering_amount || null,
      })),
    });
  });

  // If ticker filter specified, return only that ticker's sequence
  if (ticker) {
    const tickerUpper = ticker.toUpperCase();
    return sequences.filter(s => s.ticker === tickerUpper);
  }

  // Sort by most recent filing date (descending)
  return sequences.sort((a, b) => {
    const lastA = a.filings[a.filings.length - 1];
    const lastB = b.filings[b.filings.length - 1];
    const dateA = lastA.filing_datetime ? new Date(lastA.filing_datetime) : new Date(lastA.date + 'T00:00:00');
    const dateB = lastB.filing_datetime ? new Date(lastB.filing_datetime) : new Date(lastB.date + 'T00:00:00');
    return dateB.getTime() - dateA.getTime();
  });
}
