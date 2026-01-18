"use client";

import { useState, useEffect } from "react";
import { DilutionAlert } from "@/types/alert";
import { ExternalLink, Star } from "lucide-react";
import { hasValidUnderwriter } from "@/lib/alertUtils";
import FormTypeTooltip from "@/components/FormTypeTooltip";
import { isTickerWatched, toggleWatchlist } from "@/lib/watchlist";

interface AlertTableProps {
  alerts: DilutionAlert[];
  onRowClick?: (alert: DilutionAlert) => void;
  onWatchlistChange?: () => void;
}

export default function AlertTable({ alerts, onRowClick, onWatchlistChange }: AlertTableProps) {
  const [watchedTickers, setWatchedTickers] = useState<Set<string>>(new Set());

  // Load watchlist state for all unique tickers in alerts
  useEffect(() => {
    const loadWatchlistState = async () => {
      const uniqueTickers = [...new Set(alerts.map(a => a.ticker.toUpperCase()))];
      const watchlistChecks = await Promise.all(
        uniqueTickers.map(ticker => isTickerWatched(ticker).then(watched => ({ ticker, watched })))
      );
      const watchedSet = new Set(
        watchlistChecks.filter(check => check.watched).map(check => check.ticker)
      );
      setWatchedTickers(watchedSet);
    };

    if (alerts.length > 0) {
      loadWatchlistState();
    }
  }, [alerts]);

  const handleWatchlistToggle = async (ticker: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    const tickerUpper = ticker.toUpperCase();
    const success = await toggleWatchlist(tickerUpper);
    if (success) {
      const isWatched = watchedTickers.has(tickerUpper);
      setWatchedTickers(prev => {
        const next = new Set(prev);
        if (isWatched) {
          next.delete(tickerUpper);
        } else {
          next.add(tickerUpper);
        }
        return next;
      });
      onWatchlistChange?.();
    }
  };

  if (!alerts || alerts.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
        <p className="text-gray-600 dark:text-gray-400">No alerts found</p>
      </div>
    );
  }

  const getRiskColor = (score: number) => {
    if (score >= 15) return "text-red-400";
    if (score >= 10) return "text-orange-400";
    if (score >= 5) return "text-yellow-400";
    return "text-green-400";
  };

  const formatCurrency = (value: string | null) => {
    if (!value) return "-";
    try {
      const num = parseFloat(value.replace(/[$,]/g, ""));
      if (num >= 1_000_000) {
        return `$${(num / 1_000_000).toFixed(1)}M`;
      }
      return value;
    } catch {
      return value;
    }
  };

  // Format date without timezone conversion (to prevent date shifting)
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "";
    // If date is in YYYY-MM-DD format, parse as local date (not UTC)
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split("-").map(Number);
      const date = new Date(year, month - 1, day); // month is 0-indexed
      return date.toLocaleDateString();
    }
    // Otherwise, use Date constructor (may have timezone issues)
    return new Date(dateStr).toLocaleDateString();
  };

  // Format datetime, preserving the date part correctly
  const formatDateTime = (datetimeStr: string | null | undefined) => {
    if (!datetimeStr) return null;
    try {
      // If it's an ISO datetime string, extract the date part
      if (datetimeStr.includes("T")) {
        const datePart = datetimeStr.split("T")[0];
        const timePart = datetimeStr.split("T")[1]?.split(/[+\-Z]/)[0]; // Remove timezone
        const [year, month, day] = datePart.split("-").map(Number);
        const [hours, minutes] = timePart ? timePart.split(":").map(Number) : [0, 0];
        const date = new Date(year, month - 1, day, hours, minutes);
        return {
          date: date.toLocaleDateString(),
          time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
      }
      // Fallback
      const date = new Date(datetimeStr);
      return {
        date: date.toLocaleDateString(),
        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    } catch {
      return null;
    }
  };

  // Check if a filing is from today
  const isNewToday = (alert: DilutionAlert): boolean => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today

      // Check filing_datetime first (more precise)
      if (alert.filing_datetime) {
        let filingDate: Date;
        if (alert.filing_datetime.includes("T")) {
          const datePart = alert.filing_datetime.split("T")[0];
          const [year, month, day] = datePart.split("-").map(Number);
          filingDate = new Date(year, month - 1, day);
        } else {
          filingDate = new Date(alert.filing_datetime);
        }
        filingDate.setHours(0, 0, 0, 0);
        return filingDate.getTime() === today.getTime();
      }

      // Fallback to date field
      if (alert.date) {
        if (alert.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = alert.date.split("-").map(Number);
          const filingDate = new Date(year, month - 1, day);
          filingDate.setHours(0, 0, 0, 0);
          return filingDate.getTime() === today.getTime();
        }
        const filingDate = new Date(alert.date);
        filingDate.setHours(0, 0, 0, 0);
        return filingDate.getTime() === today.getTime();
      }

      return false;
    } catch {
      return false;
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-400">Date</th>
            <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-400">Ticker</th>
            <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-400">Form</th>
            <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-400">Risk Score</th>
            <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-400">Offering</th>
            <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-400">Flags</th>
            <th className="text-left p-3 text-sm font-medium text-gray-600 dark:text-gray-400">Details</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr
              key={alert.id}
              onClick={() => onRowClick?.(alert)}
              className={`border-b border-gray-200 dark:border-gray-800 transition-colors ${
                onRowClick ? "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/70" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                <div className="flex items-center gap-2">
                  <div>
                    {alert.filing_datetime ? (
                      (() => {
                        const dt = formatDateTime(alert.filing_datetime);
                        return dt ? (
                          <>
                            <div>{dt.date}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                              {dt.time}
                            </div>
                          </>
                        ) : (
                          formatDate(alert.date)
                        );
                      })()
                    ) : (
                      formatDate(alert.date)
                    )}
                  </div>
                  {isNewToday(alert) && (
                    <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded font-medium whitespace-nowrap">
                      New Today
                    </span>
                  )}
                </div>
              </td>
              <td className="p-3">
                <div className="flex items-center gap-2">
                  <a
                    href={`/company/${alert.ticker}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                  >
                    {alert.ticker}
                  </a>
                  <button
                    onClick={(e) => handleWatchlistToggle(alert.ticker, e)}
                    className={`p-1 rounded transition-colors ${
                      watchedTickers.has(alert.ticker.toUpperCase())
                        ? "text-yellow-500 dark:text-yellow-400 hover:text-yellow-600 dark:hover:text-yellow-300"
                        : "text-gray-400 dark:text-gray-500 hover:text-yellow-500 dark:hover:text-yellow-400"
                    }`}
                    title={watchedTickers.has(alert.ticker.toUpperCase()) ? "Remove from watchlist" : "Add to watchlist"}
                  >
                    <Star className={`w-4 h-4 ${watchedTickers.has(alert.ticker.toUpperCase()) ? "fill-current" : ""}`} />
                  </button>
                </div>
              </td>
              <td className="p-3 text-sm text-gray-700 dark:text-gray-400">
                <FormTypeTooltip formType={alert.form_type}>
                  <span className="cursor-help underline decoration-dotted decoration-gray-500 dark:decoration-gray-500 hover:text-gray-900 dark:hover:text-gray-300">
                    {alert.form_type}
                  </span>
                </FormTypeTooltip>
              </td>
              <td className="p-3">
                <span className={`font-semibold ${getRiskColor(alert.risk_score)}`}>
                  {alert.risk_score}
                </span>
              </td>
              <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                {formatCurrency(alert.base_offering_amount || alert.offering_amount)}
              </td>
              <td className="p-3">
                <div className="flex flex-wrap gap-1">
                  {alert.toxic_debt_detected && (
                    <span className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-medium">
                      Toxic Debt
                    </span>
                  )}
                  {alert.management_turnover && (
                    <span className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded font-medium">
                      Resignation
                    </span>
                  )}
                  {alert.warrants_found && (
                    <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded font-medium">
                      Warrants
                    </span>
                  )}
                  {hasValidUnderwriter(alert.underwriter_found) && (
                    <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded font-medium">
                      Underwriter
                    </span>
                  )}
                </div>
              </td>
              <td className="p-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    console.log('[AlertTable] Details button clicked for alert:', alert.ticker, alert.id);
                    if (onRowClick) {
                      onRowClick(alert);
                    } else {
                      console.warn('[AlertTable] onRowClick is not defined');
                    }
                  }}
                  className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
                  title="View details"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
