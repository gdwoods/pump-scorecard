"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, Building2 } from "lucide-react";

interface UnderwriterStats {
  underwriter: string;
  filingCount: number;
  avgRiskScore: number;
  maxRiskScore: number;
  minRiskScore: number;
  uniqueCompanies: string[];
  totalOfferingAmount: number;
  recentActivity: number;
}

export default function UnderwritersPage() {
  const [stats, setStats] = useState<UnderwriterStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/underwriters");
        if (response.ok) {
          const data = await response.json();
          setStats(data.stats || []);
        }
      } catch (error) {
        console.error("Error fetching underwriter stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const getRiskColor = (score: number) => {
    if (score >= 15) return "text-red-400";
    if (score >= 10) return "text-orange-400";
    if (score >= 5) return "text-yellow-400";
    return "text-green-400";
  };

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`;
    }
    return `$${value.toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen p-6 bg-gray-100 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400">Loading underwriter statistics...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gray-100 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Building2 className="w-8 h-8" />
              Underwriter Analytics
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Statistics on the most active underwriters in dilution events
            </p>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Alerts</span>
          </Link>
        </div>

        {/* Stats Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">Underwriter</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">Total Filings</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">Avg Risk Score</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">Risk Range</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">Unique Companies</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">Total Offering Amount</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-700 dark:text-gray-300">Recent (30d)</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors"
                  >
                    <td className="p-4">
                      <span className="font-semibold text-gray-900 dark:text-white">{stat.underwriter}</span>
                    </td>
                    <td className="p-4 text-gray-700 dark:text-gray-300">{stat.filingCount}</td>
                    <td className="p-4">
                      <span className={`font-semibold ${getRiskColor(stat.avgRiskScore)}`}>
                        {stat.avgRiskScore}
                      </span>
                    </td>
                    <td className="p-4 text-gray-700 dark:text-gray-300 text-sm">
                      {stat.minRiskScore} - {stat.maxRiskScore}
                    </td>
                    <td className="p-4 text-gray-700 dark:text-gray-300">{stat.uniqueCompanies.length}</td>
                    <td className="p-4 text-gray-700 dark:text-gray-300">{formatCurrency(stat.totalOfferingAmount)}</td>
                    <td className="p-4">
                      {stat.recentActivity > 0 ? (
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">
                          {stat.recentActivity}
                        </span>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-500">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {stats.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400">No underwriter data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
