// Watchlist utility functions for anonymous user tracking
// Uses localStorage for user_id (UUID) and Supabase for persistence

import { supabase } from './supabase';

const USER_ID_KEY = 'sec_alerts_user_id';

/**
 * Get or create anonymous user ID (UUID stored in localStorage)
 */
export function getUserId(): string {
  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    // Generate a simple UUID v4
    userId = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}

/**
 * Get all tickers in user's watchlist from Supabase
 */
export async function getWatchlist(): Promise<string[]> {
  try {
    const userId = getUserId();
    const { data, error } = await supabase
      .from('user_watchlists')
      .select('ticker')
      .eq('user_id', userId);

    if (error) {
      // Suppress "table doesn't exist" errors - this is expected until the table is created
      const errorCode = error.code || '';
      const errorMessage = (error.message || '').toLowerCase();
      const errorString = JSON.stringify(error);
      const errorStringLower = errorString.toLowerCase();
      
      // Check if error object is empty or has no meaningful content
      const isEmptyError = 
        errorString === '{}' || 
        errorString === 'null' ||
        (typeof error === 'object' && Object.keys(error).length === 0);
      
      // Check for table doesn't exist errors in multiple ways
      const isTableError = 
        isEmptyError || // Empty errors are likely table-related
        errorCode === '42P01' || 
        errorMessage.includes('does not exist') ||
        errorMessage.includes('relation') ||
        errorMessage.includes('table') ||
        errorStringLower.includes('does not exist') ||
        errorStringLower.includes('relation') ||
        errorStringLower.includes('42p01') ||
        errorStringLower.includes('user_watchlists');
      
      // Silently return empty array for table errors or empty errors
      if (isTableError) {
        return [];
      }
      
      // Only log errors that have meaningful content and are not table-related
      const hasErrorInfo = errorCode || errorMessage || !isEmptyError;
      if (hasErrorInfo) {
        console.error('[Watchlist] Error fetching watchlist:', error);
      }
      return [];
    }

    return (data || []).map(row => row.ticker.toUpperCase());
  } catch (error) {
    // Suppress errors if Supabase isn't configured or table doesn't exist
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorString = errorMessage.toLowerCase();
    if (
      errorString.includes('does not exist') || 
      errorString.includes('42p01') ||
      errorString.includes('relation') ||
      errorString.includes('table')
    ) {
      return [];
    }
    // Only log if it's not a table-related error
    if (errorMessage && !errorString.includes('placeholder')) {
      console.error('[Watchlist] Error:', error);
    }
    return [];
  }
}

/**
 * Check if a ticker is in the watchlist
 */
export async function isTickerWatched(ticker: string): Promise<boolean> {
  try {
    const userId = getUserId();
    const { data, error } = await supabase
      .from('user_watchlists')
      .select('ticker')
      .eq('user_id', userId)
      .eq('ticker', ticker.toUpperCase())
      .limit(1);

    if (error) {
      // Suppress "table doesn't exist" errors
      const errorCode = error.code || '';
      const errorMessage = error.message || '';
      if (errorCode === '42P01' || errorMessage.includes('does not exist')) {
        return false;
      }
      console.error('[Watchlist] Error checking ticker:', error);
      return false;
    }

    return (data || []).length > 0;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('does not exist') || errorMessage.includes('42P01')) {
      return false;
    }
    console.error('[Watchlist] Error:', error);
    return false;
  }
}

/**
 * Add a ticker to watchlist
 */
export async function addToWatchlist(ticker: string): Promise<boolean> {
  try {
    const userId = getUserId();
    const { error } = await supabase
      .from('user_watchlists')
      .upsert({
        user_id: userId,
        ticker: ticker.toUpperCase(),
      }, {
        onConflict: 'user_id,ticker'
      });

    if (error) {
      // Suppress "table doesn't exist" errors
      const errorCode = error.code || '';
      const errorMessage = error.message || '';
      if (errorCode === '42P01' || errorMessage.includes('does not exist')) {
        console.warn('[Watchlist] Table does not exist yet. Please create user_watchlists table in Supabase.');
        return false;
      }
      console.error('[Watchlist] Error adding ticker:', error);
      return false;
    }

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('does not exist') || errorMessage.includes('42P01')) {
      console.warn('[Watchlist] Table does not exist yet. Please create user_watchlists table in Supabase.');
      return false;
    }
    console.error('[Watchlist] Error:', error);
    return false;
  }
}

/**
 * Remove a ticker from watchlist
 */
export async function removeFromWatchlist(ticker: string): Promise<boolean> {
  try {
    const userId = getUserId();
    const { error } = await supabase
      .from('user_watchlists')
      .delete()
      .eq('user_id', userId)
      .eq('ticker', ticker.toUpperCase());

    if (error) {
      // Suppress "table doesn't exist" errors
      const errorCode = error.code || '';
      const errorMessage = error.message || '';
      if (errorCode === '42P01' || errorMessage.includes('does not exist')) {
        return false;
      }
      console.error('[Watchlist] Error removing ticker:', error);
      return false;
    }

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('does not exist') || errorMessage.includes('42P01')) {
      return false;
    }
    console.error('[Watchlist] Error:', error);
    return false;
  }
}

/**
 * Toggle ticker in watchlist (add if not present, remove if present)
 */
export async function toggleWatchlist(ticker: string): Promise<boolean> {
  const isWatched = await isTickerWatched(ticker);
  if (isWatched) {
    return await removeFromWatchlist(ticker);
  } else {
    return await addToWatchlist(ticker);
  }
}
