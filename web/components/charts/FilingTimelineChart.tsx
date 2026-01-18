"use client";

import { useEffect, useState } from "react";
// Filing timeline doesn't use recharts for the main visualization
import { Loader2 } from "lucide-react";

interface Filing {
  id: number;
  form_type: string;
  date: string;
  filing_datetime: string | null;
  link_to_filing: string | null;
  risk_score: number;
  base_offering_amount: string | null;
}

interface FilingSequence {
  ticker: string;
  filings: Filing[];
}

interface FilingTimelineChartProps {
  ticker?: string;
  daysBack?: number;
  limit?: number;
}

export default function FilingTimelineChart({ ticker, daysBack, limit = 10 }: FilingTimelineChartProps) {
  const [sequences, setSequences] = useState<FilingSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.append('type', 'filing-sequence');
        if (ticker) {
          params.append('ticker', ticker);
        }
        if (daysBack) {
          params.append('daysBack', daysBack.toString());
        }

        const response = await fetch(`/api/analytics?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch filing sequences: ${response.statusText}`);
        }

        const result = await response.json();
        const sequences = result.filingSequences || [];
        
        // Limit number of tickers shown
        setSequences(sequences.slice(0, limit));
      } catch (err) {
        console.error('Error fetching filing sequences:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [ticker, daysBack, limit]);

  const getFormTypeColor = (formType: string): string => {
    if (formType.includes('S-1')) return '#3b82f6'; // blue
    if (formType.includes('S-3')) return '#8b5cf6'; // purple
    if (formType.includes('EFFECT')) return '#22c55e'; // green
    if (formType.includes('424B4') || formType.includes('424B5')) return '#ef4444'; // red
    return '#6b7280'; // gray
  };

  const formatDate = (dateStr: string, datetimeStr?: string | null) => {
    try {
      const date = datetimeStr ? new Date(datetimeStr) : new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="text-red-600 dark:text-red-400 text-center">
          Error: {error}
        </div>
      </div>
    );
  }

  if (sequences.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="text-gray-600 dark:text-gray-400 text-center">
          No filing sequences available for the selected period
        </div>
      </div>
    );
  }

  // Flatten sequences for timeline view
  const timelineData: Array<{
    ticker: string;
    form_type: string;
    date: string;
    filing_datetime: string | null;
    link_to_filing: string | null;
    risk_score: number;
    displayDate: string;
    sortDate: number;
  }> = [];

  sequences.forEach(seq => {
    seq.filings.forEach(filing => {
      const date = filing.filing_datetime ? new Date(filing.filing_datetime) : new Date(filing.date + 'T00:00:00');
      timelineData.push({
        ...filing,
        ticker: seq.ticker,
        displayDate: formatDate(filing.date, filing.filing_datetime),
        sortDate: date.getTime(),
      });
    });
  });

  // Sort by date (chronologically)
  timelineData.sort((a, b) => a.sortDate - b.sortDate);

  // Group by ticker for better visualization
  const chartData = sequences.map(seq => {
    const firstFiling = seq.filings[0];
    const lastFiling = seq.filings[seq.filings.length - 1];
    const firstDate = firstFiling.filing_datetime ? new Date(firstFiling.filing_datetime) : new Date(firstFiling.date + 'T00:00:00');
    const lastDate = lastFiling.filing_datetime ? new Date(lastFiling.filing_datetime) : new Date(lastFiling.date + 'T00:00:00');
    
    return {
      ticker: seq.ticker,
      count: seq.filings.length,
      startDate: firstDate.getTime(),
      endDate: lastDate.getTime(),
      duration: lastDate.getTime() - firstDate.getTime(),
      filings: seq.filings,
    };
  }).sort((a, b) => b.endDate - a.endDate); // Sort by most recent

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 shadow-lg max-w-xs">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            {data.ticker}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mb-1">
            {data.count} filing{data.count !== 1 ? 's' : ''} in sequence
          </p>
          <div className="mt-2 space-y-1">
            {data.filings.map((filing: Filing, idx: number) => (
              <div key={idx} className="text-xs">
                <span 
                  className="font-medium px-2 py-0.5 rounded text-white"
                  style={{ backgroundColor: getFormTypeColor(filing.form_type) }}
                >
                  {filing.form_type}
                </span>
                <span className="ml-2 text-gray-600 dark:text-gray-400">
                  {formatDate(filing.date, filing.filing_datetime)}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Filing Sequence Timeline
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {ticker ? `Filing sequence for ${ticker}` : `Top ${limit} companies by filing sequence`}
        </p>
        <div className="flex items-center gap-4 mt-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-500"></div>
            <span className="text-gray-600 dark:text-gray-400">S-1/S-3</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500"></div>
            <span className="text-gray-600 dark:text-gray-400">EFFECT</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500"></div>
            <span className="text-gray-600 dark:text-gray-400">424B4/424B5</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {chartData.map((seq, idx) => {
          const daysSpan = Math.ceil(seq.duration / (1000 * 60 * 60 * 24));
          return (
            <div key={seq.ticker} className="border-l-2 border-gray-300 dark:border-gray-600 pl-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-gray-900 dark:text-white">{seq.ticker}</span>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {seq.count} filing{seq.count !== 1 ? 's' : ''} over {daysSpan} day{daysSpan !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {seq.filings.map((filing, filingIdx) => (
                  <div
                    key={filingIdx}
                    className="relative group"
                  >
                    <div
                      className="px-3 py-1.5 rounded-md text-xs font-medium text-white cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: getFormTypeColor(filing.form_type) }}
                      onClick={() => {
                        if (filing.link_to_filing) {
                          window.open(filing.link_to_filing, '_blank');
                        }
                      }}
                      title={`${filing.form_type} - ${formatDate(filing.date, filing.filing_datetime)} - Risk: ${filing.risk_score}`}
                    >
                      {filing.form_type}
                    </div>
                    {filingIdx < seq.filings.length - 1 && (
                      <span className="text-gray-400 dark:text-gray-500 mx-1">→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
