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

    // Sort by filing_datetime if available (newest first), otherwise by date
    const sortedData = (data || []).sort((a, b) => {
      // Try filing_datetime first (more precise)
      const aTime = a.filing_datetime ? new Date(a.filing_datetime).getTime() : null;
      const bTime = b.filing_datetime ? new Date(b.filing_datetime).getTime() : null;
      
      if (aTime !== null && bTime !== null) {
        return bTime - aTime; // Descending (newest first)
      }
      if (aTime !== null) return -1; // a has datetime, b doesn't - a comes first
      if (bTime !== null) return 1;  // b has datetime, a doesn't - b comes first
      
      // Both null, fall back to date
      const aDate = a.date ? new Date(a.date).getTime() : 0;
      const bDate = b.date ? new Date(b.date).getTime() : 0;
      return bDate - aDate; // Descending (newest first)
    });

    // Apply limit after sorting
    const limitedData = sortedData.slice(0, limit);

    // Debug logging
    console.log(`[API] Fetched ${data?.length || 0} alerts from Supabase, returning ${limitedData.length} after sorting`);
    if (limitedData.length > 0) {
      const dates = limitedData.map(a => a.date).filter(Boolean);
      const uniqueDates = [...new Set(dates)].sort().reverse();
      const datetimes = limitedData.map(a => a.filing_datetime).filter(Boolean);
      const uniqueDatetimes = [...new Set(datetimes)].sort().reverse();
      console.log(`[API] Date range: ${uniqueDates.slice(-1)[0]} to ${uniqueDates[0]} (${uniqueDates.length} unique dates)`);
      if (uniqueDatetimes.length > 0) {
        console.log(`[API] DateTime range: ${uniqueDatetimes[uniqueDatetimes.length - 1]} to ${uniqueDatetimes[0]} (${uniqueDatetimes.length} unique datetimes)`);
      }
      // Check specifically for 1/16/2025
      const jan16Filings = limitedData.filter(a => {
        const dateStr = a.date || '';
        return dateStr.includes('2025-01-16') || dateStr.includes('2025-01/16') || dateStr.includes('1/16/2025');
      });
      if (jan16Filings.length > 0) {
        console.log(`[API] ✓ Found ${jan16Filings.length} filing(s) from 1/16/2025 in results`);
      } else {
        console.log(`[API] ⚠️  No filings from 1/16/2025 found in returned results (check if they exist in DB)`);
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
