"use client";

import { X, Star, Filter, TrendingUp, AlertTriangle, Search, BookOpen } from "lucide-react";

interface QuickStartModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickStartModal({ isOpen, onClose }: QuickStartModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Getting Started Guide</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Introduction */}
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              What is SEC Dilution Alerts?
            </h3>
            <p className="text-gray-700 dark:text-gray-300">
              This tool automatically monitors SEC filings for dilution events and red flags that short sellers watch for. 
              It scans S-1, S-3, 424B4, 424B5, and 8-K filings in real-time and alerts you to potential dilution risks.
            </p>
          </div>

          {/* Risk Scores */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Understanding Risk Scores</h3>
            </div>
            <p className="text-gray-700 dark:text-gray-300 mb-3">
              Risk scores are calculated based on detected red flags:
            </p>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300 list-disc list-inside">
              <li><strong>+1 point</strong> for each red flag keyword found (Warrants, Convertible Note, etc.)</li>
              <li><strong>+2 points</strong> for each toxic underwriter detected (Maxim, Wainwright, Aegis)</li>
              <li><strong>+3 points</strong> for toxic debt (interest rates ≥12%)</li>
              <li><strong>+4 points</strong> for management turnover (executive resignations)</li>
              <li><strong>+2 points</strong> for warrant coverage ≥100%</li>
            </ul>
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Higher scores indicate higher dilution risk.</strong> Scores of 15+ are considered very high risk.
              </p>
            </div>
          </div>

          {/* Red Flags */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Red Flag Indicators</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-start gap-2">
                <span className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-medium">Toxic Debt</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">High interest rates (≥12%) on convertible notes or debentures</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded font-medium">Resignation</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">Management turnover (CFO, CEO, or Auditor resignations)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded font-medium">Warrants</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">Warrant coverage or warrants attached to offerings</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded font-medium">Underwriter</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">Toxic underwriters like Maxim, Wainwright, or Aegis Capital</span>
              </div>
            </div>
          </div>

          {/* Watchlist Feature */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-5 h-5 text-yellow-500 fill-current" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Watchlist Feature</h3>
            </div>
            <p className="text-gray-700 dark:text-gray-300 mb-3">
              Track specific tickers you're monitoring for dilution events:
            </p>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300 list-disc list-inside">
              <li><strong>Add from table:</strong> Click the star icon (⭐) next to any ticker in the alerts table</li>
              <li><strong>Add manually:</strong> Use the "Add Ticker to Watchlist" field in the Filters section</li>
              <li><strong>View watchlist:</strong> Toggle "Watchlist Only" to see only filings for your watched tickers</li>
              <li><strong>Persistent:</strong> Your watchlist is saved and persists across page refreshes</li>
            </ul>
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Tip:</strong> You can add tickers that don't have filings yet. They'll appear in your watchlist summary and alerts will show when filings are detected.
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Using Filters</h3>
            </div>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300 list-disc list-inside">
              <li><strong>Ticker:</strong> Search for a specific ticker symbol (e.g., "AAPL")</li>
              <li><strong>Form Type:</strong> Filter by filing type (S-1, S-3, 424B4, etc.)</li>
              <li><strong>Days Back:</strong> Limit results to recent filings (7, 30, or 90 days)</li>
              <li><strong>Watchlist Only:</strong> Show only alerts for tickers in your watchlist</li>
              <li><strong>Minimum Risk Score:</strong> Filter by minimum risk threshold (show in Advanced Filters)</li>
            </ul>
          </div>

          {/* Auto-Refresh */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Auto-Refresh</h3>
            </div>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              The page automatically refreshes every ~15 seconds to check for new filings. You can:
            </p>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300 list-disc list-inside">
              <li><strong>Pause/Resume:</strong> Click the pause/play button in the polling status box</li>
              <li><strong>Sound Alerts:</strong> Enable audible alerts when new filings are detected (bell icon in header)</li>
              <li><strong>Countdown Timer:</strong> See when the next refresh will occur</li>
            </ul>
          </div>

          {/* Tips */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-2">💡 Pro Tips</h3>
            <ul className="space-y-2 text-blue-800 dark:text-blue-200 list-disc list-inside">
              <li>Click on any alert row to see detailed information about the filing</li>
              <li>Hover over form types to see descriptions of what each filing means</li>
              <li>Use the dark/light mode toggle (moon/sun icon) in the header</li>
              <li>High risk scores don't guarantee dilution, but indicate increased risk</li>
              <li>Monitor tickers with toxic underwriters closely - they often signal dilution</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
