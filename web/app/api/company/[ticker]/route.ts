import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface CompanyStats {
  ticker: string;
  totalFilings: number;
  avgRiskScore: number;
  maxRiskScore: number;
  firstFilingDate: string | null;
  lastFilingDate: string | null;
  totalOfferingAmount: number;
  uniqueUnderwriters: string[];
  formTypeBreakdown: Record<string, number>;
  filingSequence: Array<{
    date: string;
    form_type: string;
    risk_score: number;
    base_offering_amount: string | null;
  }>;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await context.params;
    const tickerUpper = ticker.toUpperCase();

    // Fetch all filings for this ticker
    const { data: filings, error } = await supabase
      .from('sec_filing_alerts')
      .select('*')
      .eq('ticker', tickerUpper)
      .order('date', { ascending: true }); // Chronological order

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch company data', details: error.message },
        { status: 500 }
      );
    }

    if (!filings || filings.length === 0) {
      return NextResponse.json(
        { error: 'No filings found for this ticker' },
        { status: 404 }
      );
    }

    // Calculate statistics
    const totalFilings = filings.length;
    const riskScores = filings.map(f => f.risk_score).filter(s => s !== null && s !== undefined);
    const avgRiskScore = riskScores.length > 0
      ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length
      : 0;
    const maxRiskScore = riskScores.length > 0 ? Math.max(...riskScores) : 0;

    const dates = filings.map(f => f.date).filter(Boolean) as string[];
    const firstFilingDate = dates.length > 0 ? dates[0] : null;
    const lastFilingDate = dates.length > 0 ? dates[dates.length - 1] : null;

    // Calculate total offering amount
    let totalOfferingAmount = 0;
    filings.forEach(f => {
      const amount = f.base_offering_amount || f.offering_amount;
      if (amount) {
        const num = parseFloat(amount.replace(/[$,]/g, ''));
        if (!isNaN(num)) {
          totalOfferingAmount += num;
        }
      }
    });

    // Get unique underwriters
    const underwriters = filings
      .map(f => f.underwriter_found)
      .filter((uw): uw is string => uw !== null && uw !== 'nan' && uw !== 'none' && uw.trim() !== '');
    const uniqueUnderwriters = [...new Set(underwriters)];

    // Form type breakdown
    const formTypeBreakdown: Record<string, number> = {};
    filings.forEach(f => {
      const formType = f.form_type || 'Unknown';
      formTypeBreakdown[formType] = (formTypeBreakdown[formType] || 0) + 1;
    });

    // Filing sequence (chronological)
    const filingSequence = filings.map(f => ({
      date: f.date,
      form_type: f.form_type,
      risk_score: f.risk_score,
      base_offering_amount: f.base_offering_amount || f.offering_amount,
      filing_datetime: f.filing_datetime,
    }));

    const stats: CompanyStats = {
      ticker: tickerUpper,
      totalFilings,
      avgRiskScore: Math.round(avgRiskScore * 10) / 10, // Round to 1 decimal
      maxRiskScore,
      firstFilingDate,
      lastFilingDate,
      totalOfferingAmount,
      uniqueUnderwriters,
      formTypeBreakdown,
      filingSequence,
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
