"use client";

import { useState, useEffect } from "react";
import { DilutionAlert, AlertFilters } from "@/types/alert";
import AlertTable from "@/components/AlertTable";
import AlertFiltersComponent from "@/components/AlertFilters";
import AlertDetailModal from "@/components/AlertDetailModal";
import { Loader2, AlertCircle } from "lucide-react";

export default function Home() {
  const [alerts, setAlerts] = useState<DilutionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<DilutionAlert | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filters, setFilters] = useState<AlertFilters>({
    limit: 100,
  });

  const fetchAlerts = async () => {
    setLoading(true);
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
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error("Error fetching alerts:", err);
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filters.ticker, filters.formType, filters.minRiskScore, filters.daysBack]);

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
    <div className="min-h-screen p-6 bg-gray-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">SEC Dilution Alerts</h1>
          <p className="text-gray-400">
            Short seller alerts for SEC dilution filings and capital raises
          </p>
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
