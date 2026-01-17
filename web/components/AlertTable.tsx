"use client";

import { DilutionAlert } from "@/types/alert";
import { ExternalLink } from "lucide-react";
import { hasValidUnderwriter } from "@/lib/alertUtils";
import FormTypeTooltip from "@/components/FormTypeTooltip";

interface AlertTableProps {
  alerts: DilutionAlert[];
  onRowClick?: (alert: DilutionAlert) => void;
}

export default function AlertTable({ alerts, onRowClick }: AlertTableProps) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center">
        <p className="text-gray-400">No alerts found</p>
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left p-3 text-sm font-medium text-gray-400">Date</th>
            <th className="text-left p-3 text-sm font-medium text-gray-400">Ticker</th>
            <th className="text-left p-3 text-sm font-medium text-gray-400">Form</th>
            <th className="text-left p-3 text-sm font-medium text-gray-400">Risk Score</th>
            <th className="text-left p-3 text-sm font-medium text-gray-400">Offering</th>
            <th className="text-left p-3 text-sm font-medium text-gray-400">Flags</th>
            <th className="text-left p-3 text-sm font-medium text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr
              key={alert.id}
              onClick={() => onRowClick?.(alert)}
              className={`border-b border-gray-800 transition-colors ${
                onRowClick ? "cursor-pointer hover:bg-gray-800/70" : "hover:bg-gray-800/50"
              }`}
            >
              <td className="p-3 text-sm text-gray-300">
                {new Date(alert.date).toLocaleDateString()}
              </td>
              <td className="p-3">
                <span className="font-semibold text-white">{alert.ticker}</span>
              </td>
              <td className="p-3 text-sm text-gray-400">
                <FormTypeTooltip formType={alert.form_type}>
                  <span className="cursor-help underline decoration-dotted decoration-gray-500 hover:text-gray-300">
                    {alert.form_type}
                  </span>
                </FormTypeTooltip>
              </td>
              <td className="p-3">
                <span className={`font-semibold ${getRiskColor(alert.risk_score)}`}>
                  {alert.risk_score}
                </span>
              </td>
              <td className="p-3 text-sm text-gray-300">
                {formatCurrency(alert.base_offering_amount || alert.offering_amount)}
              </td>
              <td className="p-3">
                <div className="flex flex-wrap gap-1">
                  {alert.toxic_debt_detected && (
                    <span className="text-xs px-2 py-1 bg-red-900/30 text-red-400 rounded">
                      Toxic Debt
                    </span>
                  )}
                  {alert.management_turnover && (
                    <span className="text-xs px-2 py-1 bg-orange-900/30 text-orange-400 rounded">
                      Resignation
                    </span>
                  )}
                  {alert.warrants_found && (
                    <span className="text-xs px-2 py-1 bg-yellow-900/30 text-yellow-400 rounded">
                      Warrants
                    </span>
                  )}
                  {hasValidUnderwriter(alert.underwriter_found) && (
                    <span className="text-xs px-2 py-1 bg-purple-900/30 text-purple-400 rounded">
                      Underwriter
                    </span>
                  )}
                </div>
              </td>
              <td className="p-3" onClick={(e) => {
                e.stopPropagation();
                onRowClick?.(alert);
              }}>
                <button
                  className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 transition-colors"
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
