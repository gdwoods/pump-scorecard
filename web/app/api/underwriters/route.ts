import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface UnderwriterStats {
  underwriter: string;
  filingCount: number;
  avgRiskScore: number;
  maxRiskScore: number;
  minRiskScore: number;
  uniqueCompanies: string[];
  totalOfferingAmount: number;
  recentActivity: number; // Count of filings in last 30 days
}

export async function GET(request: NextRequest) {
  try {
    // Fetch all filings with underwriters
    const { data: filings, error } = await supabase
      .from('sec_filing_alerts')
      .select('*')
      .not('underwriter_found', 'is', null)
      .neq('underwriter_found', 'nan')
      .neq('underwriter_found', 'none');

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch underwriter data', details: error.message },
        { status: 500 }
      );
    }

    if (!filings || filings.length === 0) {
      return NextResponse.json({ stats: [] });
    }

    // Group by underwriter
    const underwriterMap = new Map<string, any[]>();
    filings.forEach(filing => {
      const underwriter = filing.underwriter_found?.trim();
      if (underwriter && underwriter !== 'nan' && underwriter !== 'none') {
        if (!underwriterMap.has(underwriter)) {
          underwriterMap.set(underwriter, []);
        }
        underwriterMap.get(underwriter)!.push(filing);
      }
    });

    // Calculate statistics for each underwriter
    const stats: UnderwriterStats[] = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    underwriterMap.forEach((underwriterFilings, underwriter) => {
      const riskScores = underwriterFilings
        .map(f => f.risk_score)
        .filter((s): s is number => s !== null && s !== undefined);
      
      const avgRiskScore = riskScores.length > 0
        ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length
        : 0;

      const uniqueCompanies = [...new Set(underwriterFilings.map(f => f.ticker))];

      let totalOfferingAmount = 0;
      underwriterFilings.forEach(f => {
        const amount = f.base_offering_amount || f.offering_amount;
        if (amount) {
          const num = parseFloat(amount.replace(/[$,]/g, ''));
          if (!isNaN(num)) {
            totalOfferingAmount += num;
          }
        }
      });

      // Count recent activity (last 30 days)
      const recentActivity = underwriterFilings.filter(f => {
        if (!f.date) return false;
        const filingDate = new Date(f.date + 'T00:00:00');
        return filingDate >= thirtyDaysAgo;
      }).length;

      stats.push({
        underwriter,
        filingCount: underwriterFilings.length,
        avgRiskScore: Math.round(avgRiskScore * 10) / 10,
        maxRiskScore: riskScores.length > 0 ? Math.max(...riskScores) : 0,
        minRiskScore: riskScores.length > 0 ? Math.min(...riskScores) : 0,
        uniqueCompanies,
        totalOfferingAmount,
        recentActivity,
      });
    });

    // Sort by filing count (most active first)
    stats.sort((a, b) => b.filingCount - a.filingCount);

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
