"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { Loader2 } from "lucide-react";

interface RiskDistribution {
  ranges: Array<{
    min: number;
    max: number;
    label: string;
    count: number;
    percentage: number;
  }>;
  average: number;
  median: number;
  total: number;
}

interface RiskScoreDistributionChartProps {
  daysBack?: number;
}

export default function RiskScoreDistributionChart({ daysBack }: RiskScoreDistributionChartProps) {
  const [data, setData] = useState<RiskDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.append('type', 'risk-distribution');
        if (daysBack) {
          params.append('daysBack', daysBack.toString());
        }

        const response = await fetch(`/api/analytics?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch risk distribution: ${response.statusText}`);
        }

        const result = await response.json();
        setData(result.riskDistribution);
      } catch (err) {
        console.error('Error fetching risk distribution:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [daysBack]);

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

  if (!data || data.total === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="text-gray-600 dark:text-gray-400 text-center">
          No data available for the selected period
        </div>
      </div>
    );
  }

  // Prepare chart data
  const chartData = data.ranges.map(range => ({
    name: range.label,
    count: range.count,
    percentage: Math.round(range.percentage * 10) / 10,
  }));

  // Color gradient: green (low risk) to red (high risk)
  const getColor = (index: number) => {
    const colors = [
      '#22c55e', // green-500 (0-5)
      '#84cc16', // lime-500 (5-10)
      '#eab308', // yellow-500 (10-15)
      '#f97316', // orange-500 (15-20)
      '#ef4444', // red-500 (20+)
    ];
    return colors[Math.min(index, colors.length - 1)];
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            {payload[0].payload.name} Risk Score
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium">{payload[0].value}</span> filing{payload[0].value !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {data.ranges.find(r => r.label === payload[0].payload.name)?.percentage.toFixed(1)}% of total
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
          Risk Score Distribution
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Distribution of risk scores across all filings
        </p>
        <div className="flex items-center gap-4 mt-2 text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            Average: <span className="font-medium text-gray-900 dark:text-white">{data.average}</span>
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            Median: <span className="font-medium text-gray-900 dark:text-white">{data.median}</span>
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            Total: <span className="font-medium text-gray-900 dark:text-white">{data.total}</span> filings
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
          <XAxis 
            dataKey="name" 
            stroke="#6b7280"
            className="dark:stroke-gray-400"
            tick={{ fill: '#6b7280' }}
          />
          <YAxis 
            stroke="#6b7280"
            className="dark:stroke-gray-400"
            tick={{ fill: '#6b7280' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(index)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
