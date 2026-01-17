"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DilutionAlert, AlertFilters } from "@/types/alert";
import AlertTable from "@/components/AlertTable";
import AlertFiltersComponent from "@/components/AlertFilters";
import AlertDetailModal from "@/components/AlertDetailModal";
import { Loader2, AlertCircle, RefreshCw, Pause, Play } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

export default function Home() {
  const [alerts, setAlerts] = useState<DilutionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<DilutionAlert | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [isPolling, setIsPolling] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [filters, setFilters] = useState<AlertFilters>({
    limit: 100,
  });

  // Use ref to track current alerts for comparison
  const alertsRef = useRef<DilutionAlert[]>([]);
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const fetchAlerts = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.ticker) params.append("ticker", filters.ticker);
      if (filters.formType) params.append("formType", filters.formType);
      if (filters.minRiskScore !== undefined) {
        params.append("minRiskScore", filters.minRiskScore.toString());
      }
      if (filters.daysBack) params.append("daysBack", filters.daysBack.toString());
      if (filters.limit) params.append("limit", filters.limit.toString());

      const response = await fetch(`/api/alerts?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch alerts: ${response.statusText}`);
      }

      const data = await response.json();
      const newAlerts = data.alerts || [];
      
      // Check if we have new alerts (compare alert IDs)
      const currentAlertIds = new Set(alertsRef.current.map(a => a.id));
      const hasNewAlerts = newAlerts.some(alert => !currentAlertIds.has(alert.id));
      
      if (hasNewAlerts && !isInitialLoad) {
        // Could show a notification here if desired
        const newCount = newAlerts.filter(a => !currentAlertIds.has(a.id)).length;
        console.log(`New alerts detected: ${newCount}`);
      }
      
      setAlerts(newAlerts);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Error fetching alerts:", err);
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Fetch alerts when filters change
  useEffect(() => {
    fetchAlerts(true); // Initial load
  }, [fetchAlerts]);

  // Auto-polling every 15 seconds (with random variance to avoid 403 errors)
  useEffect(() => {
    if (!isPolling) {
      setCountdown(15);
      return;
    }

    let timeoutId: NodeJS.Timeout | null = null;
    let countdownInterval: NodeJS.Timeout | null = null;
    let isActive = true;

    const scheduleNextFetch = () => {
      if (!isActive) return;

      // Clear existing timers
      if (timeoutId) clearTimeout(timeoutId);
      if (countdownInterval) clearInterval(countdownInterval);

      // Add random variance: 15 seconds ± 2 seconds (13-17 seconds)
      // This prevents appearing like a bot with perfectly timed requests
      const variance = (Math.random() - 0.5) * 4; // -2 to +2 seconds
      const intervalMs = (15 + variance) * 1000;
      const intervalSeconds = Math.round(15 + variance);
      
      // Set initial countdown
      setCountdown(intervalSeconds);
      
      // Start countdown timer
      let currentCountdown = intervalSeconds;
      countdownInterval = setInterval(() => {
        if (!isActive) return;
        currentCountdown -= 1;
        if (currentCountdown <= 0) {
          if (countdownInterval) clearInterval(countdownInterval);
        } else {
          setCountdown(currentCountdown);
        }
      }, 1000);
      
      // Schedule the actual fetch
      timeoutId = setTimeout(() => {
        if (!isActive) return;
        fetchAlerts(false); // Not initial load
        scheduleNextFetch(); // Schedule next fetch with new random variance
      }, intervalMs);
    };

    scheduleNextFetch();

    return () => {
      isActive = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [isPolling, fetchAlerts]);


  const handleFiltersChange = (newFilters: AlertFilters) => {
    setFilters(newFilters);
  };

  const handleResetFilters = () => {
    setFilters({ limit: 100 });
  };

  const handleRowClick = (alert: DilutionAlert) => {
    setSelectedAlert(alert);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedAlert(null);
  };

  return (
    <div className="min-h-screen p-6 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white dark:text-white mb-2">SEC Dilution Alerts</h1>
            <p className="text-gray-400 dark:text-gray-400">
              Short seller alerts for SEC dilution filings and capital raises
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <ThemeToggle />
            
            {/* Polling Status & Controls */}
            <div className="bg-gray-800 dark:bg-gray-800 rounded-lg p-4 min-w-[200px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Auto-refresh</span>
              <button
                onClick={() => setIsPolling(!isPolling)}
                className="text-gray-400 hover:text-white transition-colors"
                title={isPolling ? "Pause auto-refresh" : "Resume auto-refresh"}
              >
                {isPolling ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
            {isPolling ? (
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-sm text-white">
                  Next refresh in <span className="font-semibold text-blue-400">{countdown}s</span>
                </span>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Paused</div>
            )}
            {lastUpdate && (
              <div className="text-xs text-gray-500 mt-1">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </div>
            )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <AlertFiltersComponent
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onReset={handleResetFilters}
        />

        {/* Content */}
        {loading ? (
          <div className="bg-gray-800 rounded-lg p-12 text-center">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading alerts...</p>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-6">
            <div className="flex items-center gap-2 text-red-400 mb-2">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-semibold">Error</h3>
            </div>
            <p className="text-red-300">{error}</p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                {alerts.length} Alert{alerts.length !== 1 ? "s" : ""} Found
              </h2>
            </div>
            <AlertTable alerts={alerts} onRowClick={handleRowClick} />
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
