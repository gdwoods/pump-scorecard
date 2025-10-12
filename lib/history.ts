// lib/history.ts

export interface HistoricalScan {
  id: string;
  ticker: string;
  timestamp: number;
  date: string;
  score: number;
  baseScore: number;
  adjustedScore: number;
  verdict: 'Low risk' | 'Moderate risk' | 'High risk';
  summary: string;
  factors: {
    label: string;
    value: number;
    color?: string;
  }[];
  marketCap?: number;
  price?: number;
  volume?: number;
  droppinessScore?: number;
  fraudEvidence?: boolean;
  promotions?: boolean;
  riskyCountry?: boolean;
}

export interface TickerHistory {
  ticker: string;
  scans: HistoricalScan[];
  firstScan: number;
  lastScan: number;
  totalScans: number;
  averageScore: number;
  scoreTrend: 'improving' | 'declining' | 'stable';
  bestScore: number;
  worstScore: number;
}

// Storage functions
export const HISTORY_STORAGE_KEY = 'pump-scorecard-history';

export function saveScanToHistory(scanData: Omit<HistoricalScan, 'id' | 'timestamp' | 'date'>): void {
  try {
    const history = getHistory();
    const newScan: HistoricalScan = {
      ...scanData,
      id: `${scanData.ticker}-${Date.now()}`,
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
    };

    // Add to history
    history.push(newScan);

    // Keep only last 1000 scans to prevent storage bloat
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save scan to history:', error);
  }
}

export function getHistory(): HistoricalScan[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load history:', error);
    return [];
  }
}

export function getTickerHistory(ticker: string): TickerHistory | null {
  const history = getHistory();
  const tickerScans = history.filter(scan => 
    scan.ticker.toUpperCase() === ticker.toUpperCase()
  ).sort((a, b) => a.timestamp - b.timestamp);

  if (tickerScans.length === 0) return null;

  const scores = tickerScans.map(scan => scan.adjustedScore);
  const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  
  // Calculate trend (comparing first half vs second half)
  const midPoint = Math.floor(tickerScans.length / 2);
  const firstHalfAvg = scores.slice(0, midPoint).reduce((sum, score) => sum + score, 0) / midPoint;
  const secondHalfAvg = scores.slice(midPoint).reduce((sum, score) => sum + score, 0) / (scores.length - midPoint);
  
  let scoreTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (secondHalfAvg < firstHalfAvg - 5) scoreTrend = 'improving';
  else if (secondHalfAvg > firstHalfAvg + 5) scoreTrend = 'declining';

  return {
    ticker: ticker.toUpperCase(),
    scans: tickerScans,
    firstScan: tickerScans[0].timestamp,
    lastScan: tickerScans[tickerScans.length - 1].timestamp,
    totalScans: tickerScans.length,
    averageScore: Math.round(averageScore),
    scoreTrend,
    bestScore: Math.min(...scores),
    worstScore: Math.max(...scores),
  };
}

export function getAllTickers(): string[] {
  const history = getHistory();
  const tickers = new Set(history.map(scan => scan.ticker.toUpperCase()));
  return Array.from(tickers).sort();
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
}

export function exportHistory(): string {
  const history = getHistory();
  return JSON.stringify(history, null, 2);
}

export function importHistory(jsonData: string): boolean {
  try {
    const history = JSON.parse(jsonData);
    if (Array.isArray(history)) {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to import history:', error);
    return false;
  }
}
