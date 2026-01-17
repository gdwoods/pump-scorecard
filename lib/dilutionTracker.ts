import { supabase } from './supabaseClient';

export interface CompanyActivity {
  id: number;
  source: 'email' | 'telegram';
  email_id?: string;
  message_id: string;
  ticker: string;
  activity_category: 'Offering PR' | 'Private Placement' | 'Prospectus Filing' | 'Reverse Split';
  activity_subtype?: string;
  amount_millions?: number;
  description?: string;
  notification_date: string;
  email_subject?: string;
}

export interface DilutionTrackerData {
  activities: CompanyActivity[];
  totalActivities: number;
  recentActivities: number; // Last 30 days
  totalRaised: number; // Total amount raised in millions
  riskScore: number; // 0-100 score based on dilution frequency
  categories: {
    offeringPR: number;
    privatePlacement: number;
    prospectusFilings: number;
    reverseSplits: number;
  };
}

/**
 * Fetches all dilution activities for a specific ticker
 */
export async function getDilutionActivities(ticker: string): Promise<CompanyActivity[]> {
  try {
    const { data, error } = await supabase
      .from('company_activities')
      .select('*')
      .eq('ticker', ticker.toUpperCase())
      .order('notification_date', { ascending: false });

    if (error) {
      console.error('Error fetching dilution activities:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception fetching dilution activities:', error);
    return [];
  }
}

/**
 * Fetches recent dilution activities across all tickers (for alerts)
 */
export async function getRecentDilutionActivities(days: number = 7, limit: number = 50): Promise<CompanyActivity[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('company_activities')
      .select('*')
      .gte('notification_date', cutoffDate.toISOString())
      .order('notification_date', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent dilution activities:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception fetching recent dilution activities:', error);
    return [];
  }
}

/**
 * Calculates dilution risk score and statistics for a ticker
 */
export function calculateDilutionRisk(activities: CompanyActivity[]): DilutionTrackerData {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  // Count activities by category
  const categories = {
    offeringPR: 0,
    privatePlacement: 0,
    prospectusFilings: 0,
    reverseSplits: 0,
  };

  let totalRaised = 0;
  let recentActivities = 0;
  let activitiesLast90Days = 0;
  let activitiesLastYear = 0;

  activities.forEach(activity => {
    const activityDate = new Date(activity.notification_date);

    // Category counts
    switch (activity.activity_category) {
      case 'Offering PR':
        categories.offeringPR++;
        break;
      case 'Private Placement':
        categories.privatePlacement++;
        break;
      case 'Prospectus Filing':
        categories.prospectusFilings++;
        break;
      case 'Reverse Split':
        categories.reverseSplits++;
        break;
    }

    // Sum raised amounts
    if (activity.amount_millions) {
      totalRaised += activity.amount_millions;
    }

    // Time-based counts
    if (activityDate >= thirtyDaysAgo) {
      recentActivities++;
    }
    if (activityDate >= ninetyDaysAgo) {
      activitiesLast90Days++;
    }
    if (activityDate >= oneYearAgo) {
      activitiesLastYear++;
    }
  });

  // Calculate risk score (0-100)
  // Higher score = higher dilution risk
  let riskScore = 0;

  // Recent activity weight (30 days) - up to 40 points
  if (recentActivities >= 3) riskScore += 40;
  else if (recentActivities >= 2) riskScore += 30;
  else if (recentActivities >= 1) riskScore += 20;

  // 90-day activity weight - up to 25 points
  if (activitiesLast90Days >= 5) riskScore += 25;
  else if (activitiesLast90Days >= 3) riskScore += 20;
  else if (activitiesLast90Days >= 2) riskScore += 15;
  else if (activitiesLast90Days >= 1) riskScore += 10;

  // Annual activity weight - up to 20 points
  if (activitiesLastYear >= 10) riskScore += 20;
  else if (activitiesLastYear >= 7) riskScore += 15;
  else if (activitiesLastYear >= 5) riskScore += 10;
  else if (activitiesLastYear >= 3) riskScore += 5;

  // Reverse split penalty - up to 10 points
  if (categories.reverseSplits >= 2) riskScore += 10;
  else if (categories.reverseSplits >= 1) riskScore += 5;

  // Large raise bonus - up to 5 points
  if (totalRaised >= 50) riskScore += 5;
  else if (totalRaised >= 20) riskScore += 3;

  // Cap at 100
  riskScore = Math.min(100, riskScore);

  return {
    activities,
    totalActivities: activities.length,
    recentActivities,
    totalRaised,
    riskScore,
    categories,
  };
}

/**
 * Fetches and analyzes dilution data for a ticker
 */
export async function getDilutionTrackerData(ticker: string): Promise<DilutionTrackerData> {
  const activities = await getDilutionActivities(ticker);
  return calculateDilutionRisk(activities);
}

/**
 * Gets top diluters (most active tickers)
 */
export async function getTopDiluters(limit: number = 20): Promise<Array<{ ticker: string; count: number }>> {
  try {
    const { data, error } = await supabase
      .from('company_activities')
      .select('ticker')
      .order('notification_date', { ascending: false });

    if (error) {
      console.error('Error fetching top diluters:', error);
      return [];
    }

    // Count activities per ticker
    const tickerCounts = new Map<string, number>();
    data?.forEach(row => {
      const count = tickerCounts.get(row.ticker) || 0;
      tickerCounts.set(row.ticker, count + 1);
    });

    // Sort and limit
    return Array.from(tickerCounts.entries())
      .map(([ticker, count]) => ({ ticker, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  } catch (error) {
    console.error('Exception fetching top diluters:', error);
    return [];
  }
}
