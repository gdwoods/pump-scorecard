"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TickerHistory, getTickerHistory, getAllTickers } from "@/lib/history";
import { formatNumber } from "@/utils/formatNumber";

interface HistoryCardProps {
  ticker: string;
  refreshTrigger?: number; // Add this to trigger refresh
}

export default function HistoryCard({ ticker, refreshTrigger }: HistoryCardProps) {
  const [tickerHistory, setTickerHistory] = useState<TickerHistory | null>(null);
  const [allTickers, setAllTickers] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const history = getTickerHistory(ticker);
    setTickerHistory(history);
    setAllTickers(getAllTickers());
  }, [ticker, refreshTrigger]);

  if (!tickerHistory) {
    return (
      <Card className="p-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <CardContent className="space-y-3">
          <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
            📊 Historical Analysis — {ticker}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No historical data available for this ticker yet. Scan results will be saved automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { scans, totalScans, averageScore, scoreTrend, bestScore, worstScore } = tickerHistory;

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return '📈';
      case 'declining': return '📉';
      default: return '➡️';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving': return 'text-green-500';
      case 'declining': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const recentScans = scans.slice(-5).reverse(); // Last 5 scans, most recent first
  
  // Debug: Log scan data to see what's available
  if (recentScans.length > 0) {
    console.log('Recent scans data:', recentScans.map(scan => ({
      date: scan.date,
      timestamp: scan.timestamp,
      timeString: scan.timestamp ? new Date(scan.timestamp).toLocaleTimeString() : 'No timestamp'
    })));
  }

  return (
    <Card className="p-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            📊 Historical Analysis — {ticker}
          </h2>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-blue-500 hover:underline"
          >
            {expanded ? "Show Less" : "Show More"}
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{totalScans}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Total Scans</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{averageScore}%</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Avg Score</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{bestScore}%</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Best Score</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{worstScore}%</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Worst Score</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {scans.length > 0 ? scans[scans.length - 1].droppinessScore || 'N/A' : 'N/A'}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Droppiness</div>
          </div>
        </div>

        {/* Trend Indicator */}
        <div className="flex items-center justify-center space-x-2">
          <span className="text-lg">{getTrendIcon(scoreTrend)}</span>
          <span className={`text-sm font-medium ${getTrendColor(scoreTrend)}`}>
            Score trend: {scoreTrend}
          </span>
        </div>

        {/* Recent Scans */}
        {expanded && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">
              Recent Scans:
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {recentScans.map((scan, index) => (
                <div
                  key={scan.id}
                  className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex flex-col">
                      <span className="text-gray-500 text-xs">{scan.date}</span>
                      <span className="text-gray-400 text-xs">
                        {scan.timestamp ? new Date(scan.timestamp).toLocaleTimeString() : 'Unknown time'}
                      </span>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      scan.verdict === 'High risk' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                      scan.verdict === 'Moderate risk' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    }`}>
                      {scan.verdict}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">{scan.adjustedScore}%</span>
                    {scan.droppinessScore !== undefined && (
                      <span className="text-purple-600 font-medium">{scan.droppinessScore}%</span>
                    )}
                    {scan.price && (
                      <span className="text-gray-500">${scan.price.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Tickers Summary */}
        {expanded && allTickers.length > 1 && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
            <h3 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200">
              All Tracked Tickers ({allTickers.length}):
            </h3>
            <div className="flex flex-wrap gap-1">
              {allTickers.map((t) => (
                <span
                  key={t}
                  className={`px-2 py-1 rounded text-xs ${
                    t === ticker.toUpperCase()
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
