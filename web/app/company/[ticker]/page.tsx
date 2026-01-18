"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DilutionAlert } from "@/types/alert";
import { ArrowLeft, TrendingUp, AlertTriangle, DollarSign, FileText, Calendar } from "lucide-react";
import AlertTable from "@/components/AlertTable";
import AlertDetailModal from "@/components/AlertDetailModal";

interface CompanyStats {
  ticker: string;
  totalFilings: number;
  avgRiskScore: number;
  maxRiskScore: number;
  firstFilingDate: string | null;
  lastFilingDate: string | null;
  totalOfferingAmount: number;
  uniqueUnderwriters: string[];
  formTypeBreakdown: Record<string, number>;
  filingSequence: Array<{
    date: string;
    form_type: string;
    risk_score: number;
    base_offering_amount: string | null;
    filing_datetime?: string | null;
  }>;
}

export default function CompanyProfilePage() {
  const params = useParams();
  // Handle params - in Next.js 16, params is available synchronously in client components
  const tickerParam = params?.ticker;
  const ticker = typeof tickerParam === 'string' ? tickerParam.toUpperCase() : "";

  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [alerts, setAlerts] = useState<DilutionAlert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<DilutionAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch company stats
        const statsResponse = await fetch(`/api/company/${ticker}`);
        if (!statsResponse.ok) {
          if (statsResponse.status === 404) {
            setError(`No filings found for ticker ${ticker}`);
          } else {
            setError("Failed to load company data");
          }
          setLoading(false);
          return;
        }
        const statsData = await statsResponse.json();
        setStats(statsData.stats);

        // Fetch all filings for this ticker
        const alertsResponse = await fetch(`/api/alerts?ticker=${ticker}&limit=500`);
        if (alertsResponse.ok) {
          const alertsData = await alertsResponse.json();
          setAlerts(alertsData.alerts || []);
        }
      } catch (err) {
        console.error("Error fetching company data:", err);
        setError("Failed to load company data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [ticker]);

  const getRiskColor = (score: number) => {
    if (score >= 15) return "text-red-400";
    if (score >= 10) return "text-orange-400";
    if (score >= 5) return "text-yellow-400";
    return "text-green-400";
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return "$0";
    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`;
    }
    return `$${value.toLocaleString()}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString();
    }
    return new Date(dateStr).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen p-6 bg-gray-100 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400">Loading company profile...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-6 bg-gray-100 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <Link
              href="/"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← Back to Alerts
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="min-h-screen p-6 bg-gray-100 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Alerts</span>
          </Link>
        </div>

        {/* Company Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            {stats.ticker} - Company Profile
          </h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Filings</div>
              <div className="text-2xl font-semibold text-gray-900 dark:text-white">{stats.totalFilings}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Avg Risk Score</div>
              <div className={`text-2xl font-semibold ${getRiskColor(stats.avgRiskScore)}`}>
                {stats.avgRiskScore}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Max Risk Score</div>
              <div className={`text-2xl font-semibold ${getRiskColor(stats.maxRiskScore)}`}>
                {stats.maxRiskScore}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Offering Amount</div>
              <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                {formatCurrency(stats.totalOfferingAmount)}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Filing Timeline */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Filing Timeline
            </h2>
            <div className="space-y-2">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">First Filing:</span> {formatDate(stats.firstFilingDate)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Last Filing:</span> {formatDate(stats.lastFilingDate)}
              </div>
              <div className="mt-4">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recent Sequence:</div>
                <div className="space-y-1">
                  {stats.filingSequence.slice(-5).reverse().map((filing, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs py-1 border-b border-gray-200 dark:border-gray-700 last:border-0"
                    >
                      <span className="text-gray-600 dark:text-gray-400">
                        {formatDate(filing.date)} - {filing.form_type}
                      </span>
                      <span className={getRiskColor(filing.risk_score)}>
                        Risk: {filing.risk_score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Underwriters & Form Types */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Details
            </h2>
            <div className="space-y-4">
              {stats.uniqueUnderwriters.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Underwriters ({stats.uniqueUnderwriters.length}):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {stats.uniqueUnderwriters.map((uw, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-xs font-medium"
                      >
                        {uw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Form Types:</div>
                <div className="space-y-1">
                  {Object.entries(stats.formTypeBreakdown).map(([formType, count]) => (
                    <div key={formType} className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                      <span>{formType}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* All Filings Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            All Filings ({alerts.length})
          </h2>
          <AlertTable
            alerts={alerts}
            onRowClick={setSelectedAlert}
          />
        </div>
      </div>

      {/* Detail Modal */}
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
        />
      )}
    </div>
  );
}
