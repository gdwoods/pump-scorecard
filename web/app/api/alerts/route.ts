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
    const limit = parseInt(searchParams.get('limit') || '500'); // Increased default to show more filings

    // Build query - order by filing_datetime if available, otherwise date
    // This ensures newest filings (like 1/16/2025) show up first
    // Note: Supabase doesn't support multiple .order() calls in the same chain,
    // so we'll fetch and sort in memory if needed
    let query = supabase
      .from('sec_filing_alerts')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit * 2); // Fetch more to account for sorting after

    // Filter out UNKNOWN tickers
    query = query.neq('ticker', 'UNKNOWN');

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

    // Sort by date first (primary), then by filing_datetime if available (secondary)
    // This ensures filings with same date are ordered by time, but don't penalize filings without datetime
    const sortedData = (data || []).sort((a, b) => {
      // Primary sort: by date (newest first)
      const aDate = a.date ? new Date(a.date + 'T00:00:00').getTime() : 0; // Use date as primary
      const bDate = b.date ? new Date(b.date + 'T00:00:00').getTime() : 0;
      
      if (aDate !== bDate) {
        return bDate - aDate; // Descending (newest first)
      }
      
      // Secondary sort: if same date, use filing_datetime if available
      const aTime = a.filing_datetime ? new Date(a.filing_datetime).getTime() : null;
      const bTime = b.filing_datetime ? new Date(b.filing_datetime).getTime() : null;
      
      if (aTime !== null && bTime !== null) {
        return bTime - aTime; // Descending (newest first)
      }
      if (aTime !== null) return -1; // a has datetime, b doesn't - a comes first
      if (bTime !== null) return 1;  // b has datetime, a doesn't - b comes first
      
      // Same date, neither has datetime - maintain order (both are equal priority)
      return 0;
    });

    // Apply limit after sorting
    const limitedData = sortedData.slice(0, limit);

    // Debug logging
    console.log(`[API] Fetched ${data?.length || 0} alerts from Supabase, returning ${limitedData.length} after sorting`);
    if (data && data.length > 0) {
      const allTickers = [...new Set(data.map(a => a.ticker).filter(Boolean))];
      const allFormTypes = [...new Set(data.map(a => a.form_type).filter(Boolean))];
      console.log(`[API] Total unique tickers in DB: ${allTickers.length}, form types: ${allFormTypes.join(', ')}`);
      
      // Check for specific tickers mentioned
      const bctxwFilings = data.filter(a => a.ticker === 'BCTXW' || a.ticker === 'BCTXW');
      const zbaiFilings = data.filter(a => a.ticker === 'ZBAI');
      if (bctxwFilings.length > 0) {
        console.log(`[API] BCTXW filings in DB: ${bctxwFilings.length}`, bctxwFilings.map(f => ({ date: f.date, form_type: f.form_type, filing_datetime: f.filing_datetime })));
        const inResults = limitedData.filter(a => a.ticker === 'BCTXW' || a.ticker === 'BCTXW');
        if (inResults.length === 0) {
          console.log(`[API] ⚠️  BCTXW filings exist in DB but NOT in returned results (check sorting/limit)`);
        }
      }
      if (zbaiFilings.length > 0) {
        console.log(`[API] ZBAI filings in DB: ${zbaiFilings.length}`, zbaiFilings.map(f => ({ date: f.date, form_type: f.form_type, filing_datetime: f.filing_datetime })));
        const inResults = limitedData.filter(a => a.ticker === 'ZBAI');
        if (inResults.length === 0) {
          console.log(`[API] ⚠️  ZBAI filings exist in DB but NOT in returned results (check sorting/limit)`);
        }
      }
    }
    if (limitedData.length > 0) {
      const dates = limitedData.map(a => a.date).filter(Boolean);
      const uniqueDates = [...new Set(dates)].sort().reverse();
      const datetimes = limitedData.map(a => a.filing_datetime).filter(Boolean);
      const uniqueDatetimes = [...new Set(datetimes)].sort().reverse();
      const resultTickers = [...new Set(limitedData.map(a => a.ticker).filter(Boolean))];
      const resultFormTypes = [...new Set(limitedData.map(a => a.form_type).filter(Boolean))];
      console.log(`[API] Returned ${limitedData.length} alerts: dates ${uniqueDates.slice(-1)[0]} to ${uniqueDates[0]}, ${resultTickers.length} tickers, form types: ${resultFormTypes.join(', ')}`);
      if (uniqueDatetimes.length > 0) {
        console.log(`[API] DateTime range: ${uniqueDatetimes[uniqueDatetimes.length - 1]} to ${uniqueDatetimes[0]} (${uniqueDatetimes.length} unique datetimes)`);
      }
    }

    return NextResponse.json({ alerts: limitedData });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
