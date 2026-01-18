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
      console.error('[Watchlist] Error fetching watchlist:', error);
      return [];
    }

    return (data || []).map(row => row.ticker.toUpperCase());
  } catch (error) {
    console.error('[Watchlist] Error:', error);
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
      console.error('[Watchlist] Error checking ticker:', error);
      return false;
    }

    return (data || []).length > 0;
  } catch (error) {
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
      console.error('[Watchlist] Error adding ticker:', error);
      return false;
    }

    return true;
  } catch (error) {
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
      console.error('[Watchlist] Error removing ticker:', error);
      return false;
    }

    return true;
  } catch (error) {
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
