"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Loader2 } from "lucide-react";

interface OfferingTrend {
  period: string;
  total_amount: number;
  average_amount: number;
  filing_count: number;
  min_amount: number;
  max_amount: number;
}

interface OfferingTrendsChartProps {
  daysBack?: number;
  view?: 'line' | 'bar';
}

export default function OfferingTrendsChart({ daysBack, view = 'line' }: OfferingTrendsChartProps) {
  const [data, setData] = useState<OfferingTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.append('type', 'offering-trends');
        if (daysBack) {
          params.append('daysBack', daysBack.toString());
        }

        const response = await fetch(`/api/analytics?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch offering trends: ${response.statusText}`);
        }

        const result = await response.json();
        setData(result.offeringTrends || []);
      } catch (err) {
        console.error('Error fetching offering trends:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [daysBack]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
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

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="text-gray-600 dark:text-gray-400 text-center">
          No offering data available for the selected period
        </div>
      </div>
    );
  }

  // Prepare chart data (convert amounts to millions for better readability)
  const chartData = data.map(trend => ({
    period: trend.period,
    average: trend.average_amount / 1000000, // Convert to millions
    total: trend.total_amount / 1000000,
    count: trend.filing_count,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            {data.period}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
            <span className="font-medium">Average:</span> {formatCurrency(data.average * 1000000)}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
            <span className="font-medium">Total:</span> {formatCurrency(data.total * 1000000)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {data.count} filing{data.count !== 1 ? 's' : ''}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Offering Amount Trends
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Average offering amounts by month
        </p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        {view === 'line' ? (
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
            <XAxis 
              dataKey="period" 
              stroke="#6b7280"
              className="dark:stroke-gray-400"
              tick={{ fill: '#6b7280', fontSize: 12 }}
            />
            <YAxis 
              stroke="#6b7280"
              className="dark:stroke-gray-400"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickFormatter={(value) => `$${value.toFixed(1)}M`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="average" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              name="Average Amount"
            />
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
            <XAxis 
              dataKey="period" 
              stroke="#6b7280"
              className="dark:stroke-gray-400"
              tick={{ fill: '#6b7280', fontSize: 12 }}
            />
            <YAxis 
              stroke="#6b7280"
              className="dark:stroke-gray-400"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickFormatter={(value) => `$${value.toFixed(1)}M`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="average" fill="#3b82f6" radius={[8, 8, 0, 0]} name="Average Amount" />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
