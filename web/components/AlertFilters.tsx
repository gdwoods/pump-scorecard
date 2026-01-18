"use client";

import { useState } from "react";
import { Search, Filter, X, Star } from "lucide-react";
import { AlertFilters } from "@/types/alert";

interface AlertFiltersProps {
  filters: AlertFilters;
  onFiltersChange: (filters: AlertFilters) => void;
  onReset: () => void;
}

export default function AlertFiltersComponent({
  filters,
  onFiltersChange,
  onReset,
}: AlertFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateFilter = (key: keyof AlertFilters, value: string | number | boolean | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
    });
  };

  const hasActiveFilters = filters.ticker || filters.formType || filters.minRiskScore || filters.daysBack || filters.watchlistOnly;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 space-y-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filters</h3>
        </div>
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Ticker Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">
            Ticker
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-400" />
            <input
              type="text"
              placeholder="e.g., FCHS"
              value={filters.ticker || ""}
              onChange={(e) => updateFilter("ticker", e.target.value.toUpperCase())}
              className="w-full pl-10 pr-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Form Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">
            Form Type
          </label>
          <select
            value={filters.formType || ""}
            onChange={(e) => updateFilter("formType", e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Forms</option>
            <option value="S-1">S-1</option>
            <option value="S-1/A">S-1/A</option>
            <option value="S-3">S-3</option>
            <option value="424B4">424B4</option>
            <option value="424B5">424B5</option>
            <option value="8-K">8-K</option>
          </select>
        </div>

        {/* Days Back */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">
            Days Back
          </label>
          <select
            value={filters.daysBack || ""}
            onChange={(e) => updateFilter("daysBack", e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>

        {/* Watchlist Toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">
            Watchlist
          </label>
          <button
            onClick={() => updateFilter("watchlistOnly", !filters.watchlistOnly)}
            className={`w-full px-3 py-2 rounded-md border transition-colors flex items-center justify-center gap-2 ${
              filters.watchlistOnly
                ? "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400"
                : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600"
            }`}
          >
            <Star className={`w-4 h-4 ${filters.watchlistOnly ? "fill-current" : ""}`} />
            <span className="text-sm font-medium">Watchlist Only</span>
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          {showAdvanced ? "Hide" : "Show"} Advanced Filters
        </button>

        {showAdvanced && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">
                Minimum Risk Score
              </label>
              <input
                type="number"
                min="0"
                max="20"
                placeholder="0"
                value={filters.minRiskScore || ""}
                onChange={(e) => updateFilter("minRiskScore", e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
