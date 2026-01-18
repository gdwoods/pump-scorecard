"use client";

import { useState } from "react";
import { Search, Filter, X, Star, Plus, AlertTriangle } from "lucide-react";
import { AlertFilters } from "@/types/alert";
import { addToWatchlist, getWatchlist } from "@/lib/watchlist";

interface AlertFiltersProps {
  filters: AlertFilters;
  onFiltersChange: (filters: AlertFilters) => void;
  onReset: () => void;
  onWatchlistChange?: () => void;
}

export default function AlertFiltersComponent({
  filters,
  onFiltersChange,
  onReset,
  onWatchlistChange,
}: AlertFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualTicker, setManualTicker] = useState("");
  const [addingTicker, setAddingTicker] = useState(false);
  const [priceWarning, setPriceWarning] = useState<{
    ticker: string;
    price: number;
  } | null>(null);

  const updateFilter = (key: keyof AlertFilters, value: string | number | boolean | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
    });
  };

  const handleAddTicker = async (ticker: string, confirmed: boolean = false) => {
    if (!ticker.trim()) return;
    
    const tickerUpper = ticker.trim().toUpperCase();

    // If user confirmed the warning, skip price check and add directly
    if (confirmed) {
      setAddingTicker(true);
      try {
        const success = await addToWatchlist(tickerUpper);
        if (success) {
          setManualTicker("");
          setPriceWarning(null);
          onWatchlistChange?.();
        }
      } catch (error) {
        console.error("Error adding ticker:", error);
      } finally {
        setAddingTicker(false);
      }
      return;
    }

    // First-time add: check price first
    setAddingTicker(true);
    try {
      // Check if ticker already has filings in the database (if so, no price check needed)
      const alertsResponse = await fetch(`/api/alerts?ticker=${tickerUpper}&limit=1`);
      const alertsData = await alertsResponse.json();
      const hasExistingFilings = alertsData.alerts && alertsData.alerts.length > 0;

      // If no existing filings, check current stock price
      if (!hasExistingFilings) {
        const priceResponse = await fetch(`/api/check-price?ticker=${tickerUpper}`);
        const priceData = await priceResponse.json();
        
        if (priceData.found && priceData.price !== null && priceData.price >= 20.0) {
          // Show warning if price >= $20
          setPriceWarning({ ticker: tickerUpper, price: priceData.price });
          setAddingTicker(false);
          return;
        }
      }

      // Price is fine or ticker has existing filings - add to watchlist
      const success = await addToWatchlist(tickerUpper);
      if (success) {
        setManualTicker("");
        setPriceWarning(null);
        onWatchlistChange?.();
      }
    } catch (error) {
      console.error("Error adding ticker:", error);
    } finally {
      setAddingTicker(false);
    }
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
                    <option value="EFFECT">EFFECT</option>
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

      {/* Manual Ticker Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-2">
          Add Ticker to Watchlist
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="e.g., AAPL, TSLA"
              value={manualTicker}
              onChange={(e) => setManualTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onKeyPress={(e) => {
                if (e.key === "Enter" && manualTicker.trim()) {
                  handleAddTicker(manualTicker.trim());
                }
              }}
              className="w-full pl-10 pr-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={10}
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-400" />
          </div>
          <button
            onClick={() => {
              if (manualTicker.trim()) {
                handleAddTicker(manualTicker.trim());
              }
            }}
            disabled={!manualTicker.trim() || addingTicker}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {addingTicker ? "Adding..." : "Add"}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Add any ticker symbol to your watchlist, even if it doesn't have filings yet
        </p>
      </div>

      {/* Price Warning Modal */}
      {priceWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-yellow-300 dark:border-yellow-700">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  High Stock Price Warning
                </h3>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                  <strong>{priceWarning.ticker}</strong> is currently trading at <strong>${priceWarning.price.toFixed(2)}</strong>, which is above the $20 threshold.
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  The app only monitors companies trading below $20. Adding this ticker to your watchlist won't generate new filing alerts since the scanner excludes stocks over $20.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      handleAddTicker(priceWarning.ticker, true);
                    }}
                    className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md transition-colors font-medium"
                  >
                    Add Anyway
                  </button>
                  <button
                    onClick={() => {
                      setPriceWarning(null);
                      setAddingTicker(false);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
