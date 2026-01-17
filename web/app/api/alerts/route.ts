import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic'; // Ensure fresh data on each request

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker');
    const formType = searchParams.get('formType');
    const minRiskScore = searchParams.get('minRiskScore');
    const daysBack = searchParams.get('daysBack');
    const limit = parseInt(searchParams.get('limit') || '100');

    // Build query
    let query = supabase
      .from('sec_filing_alerts')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit);

    // Apply filters
    if (ticker) {
      query = query.eq('ticker', ticker.toUpperCase());
    }
    if (formType) {
      query = query.eq('form_type', formType);
    }
    if (minRiskScore) {
      query = query.gte('risk_score', parseInt(minRiskScore));
    }
    if (daysBack) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(daysBack));
      query = query.gte('date', daysAgo.toISOString().split('T')[0]);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch alerts', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ alerts: data || [] });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
