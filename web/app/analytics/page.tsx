"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import RiskScoreDistributionChart from "@/components/charts/RiskScoreDistributionChart";
import OfferingTrendsChart from "@/components/charts/OfferingTrendsChart";
import FilingTimelineChart from "@/components/charts/FilingTimelineChart";

export default function AnalyticsPage() {
  const [daysBack, setDaysBack] = useState<number | undefined>(undefined);

  return (
    <div className="min-h-screen p-6 bg-gray-100 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Analytics & Charts</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Visual insights into SEC filing patterns and dilution trends
              </p>
            </div>
          </div>
          <Link href="/" passHref>
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Alerts
            </button>
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-2">
            Time Period
          </label>
          <select
            value={daysBack || ""}
            onChange={(e) => setDaysBack(e.target.value ? parseInt(e.target.value) : undefined)}
            className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Time</option>
            <option value="30">Last 30 Days</option>
            <option value="60">Last 60 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="180">Last 6 Months</option>
            <option value="365">Last Year</option>
          </select>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 gap-6">
          {/* Risk Score Distribution */}
          <div>
            <RiskScoreDistributionChart daysBack={daysBack} />
          </div>

          {/* Offering Trends */}
          <div>
            <OfferingTrendsChart daysBack={daysBack} view="line" />
          </div>

          {/* Filing Timeline */}
          <div>
            <FilingTimelineChart daysBack={daysBack} limit={15} />
          </div>
        </div>

        {/* Back to Alerts Button at bottom */}
        <div className="mt-10 text-center">
          <Link href="/" passHref>
            <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-lg flex items-center justify-center gap-2 mx-auto">
              <ArrowLeft className="w-5 h-5" /> Back to Alerts
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
