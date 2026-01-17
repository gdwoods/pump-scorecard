"use client";

import { DilutionAlert } from "@/types/alert";
import { X, ExternalLink, AlertTriangle, TrendingUp, Users, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { hasValidUnderwriter } from "@/lib/alertUtils";
import FormTypeTooltip from "@/components/FormTypeTooltip";

interface AlertDetailModalProps {
  alert: DilutionAlert;
  isOpen: boolean;
  onClose: () => void;
}

export default function AlertDetailModal({ alert, isOpen, onClose }: AlertDetailModalProps) {
  if (!isOpen) return null;

  const getRiskColor = (score: number) => {
    if (score >= 15) return "text-red-400";
    if (score >= 10) return "text-orange-400";
    if (score >= 5) return "text-yellow-400";
    return "text-green-400";
  };

  const formatValue = (value: string | null | undefined) => {
    if (!value || value === "None" || value === "null") return "-";
    return value;
  };

  const formatCurrencyValue = (value: string | null | undefined) => {
    if (!value || value === "None" || value === "null") return "-";
    try {
      const num = parseFloat(value.replace(/[$,]/g, ""));
      if (num >= 1_000_000) {
        return `$${(num / 1_000_000).toFixed(1)}M`;
      }
      if (num >= 1_000) {
        return `$${(num / 1_000).toFixed(1)}K`;
      }
      return value;
    } catch {
      return value;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">{alert.ticker}</h2>
            <p className="text-gray-400 text-sm mt-1">
              <FormTypeTooltip formType={alert.form_type}>
                <span className="cursor-help underline decoration-dotted decoration-gray-500 hover:text-gray-300">
                  {alert.form_type}
                </span>
              </FormTypeTooltip> • {alert.filing_datetime ? (
                <>
                  {new Date(alert.filing_datetime).toLocaleDateString()} at {new Date(alert.filing_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </>
              ) : (
                new Date(alert.date).toLocaleDateString()
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Risk Score & Flags */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-gray-400" />
                <h3 className="font-semibold text-white">Risk Score</h3>
              </div>
              <p className={`text-3xl font-bold ${getRiskColor(alert.risk_score)}`}>
                {alert.risk_score}
              </p>
              <div className="mt-3 pt-3 border-t border-gray-700">
                <p className="text-xs text-gray-400 leading-relaxed">
                  <strong className="text-gray-300">How the Risk Score is Calculated:</strong><br />
                  The risk score is based on red flag indicators found in the filing:
                  <br />• Each red flag keyword (warrants, convertible notes, ATM offerings, etc.): +1 point
                  <br />• Each problematic underwriter found: +2 points
                  <br />• Toxic debt detected (high-interest loans ≥12%): +3 points
                  <br />• Management turnover detected: +4 points
                  <br />• Warrant coverage ≥100%: +2 points
                  <br />
                  Higher scores indicate greater dilution risk. Scores ≥15 are very high risk, 10-14 are high risk, and 5-9 are moderate risk.
                </p>
              </div>
            </div>

            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-gray-400" />
                <h3 className="font-semibold text-white">Red Flags</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {alert.toxic_debt_detected && (
                  <span className="text-xs px-2 py-1 bg-red-900/30 text-red-400 rounded">
                    Toxic Debt
                  </span>
                )}
                {alert.management_turnover && (
                  <span className="text-xs px-2 py-1 bg-orange-900/30 text-orange-400 rounded">
                    Management Turnover
                  </span>
                )}
                {alert.warrants_found && (
                  <span className="text-xs px-2 py-1 bg-yellow-900/30 text-yellow-400 rounded">
                    Warrants
                  </span>
                )}
                {hasValidUnderwriter(alert.underwriter_found) && (
                  <span className="text-xs px-2 py-1 bg-purple-900/30 text-purple-400 rounded">
                    Underwriter: {alert.underwriter_found}
                  </span>
                )}
                {!alert.toxic_debt_detected && !alert.management_turnover && !alert.warrants_found && !alert.underwriter_found && (
                  <span className="text-xs text-gray-400">None</span>
                )}
              </div>
            </div>
          </div>

          {/* Offering Details */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-gray-400" />
              <h3 className="font-semibold text-white">Offering Details</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-400 mb-1">Base Offering Amount</p>
                <p className="text-white font-semibold">
                  {formatCurrencyValue(alert.base_offering_amount || alert.offering_amount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Share Price</p>
                <p className="text-white font-semibold">{formatValue(alert.share_price)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Number of Shares</p>
                <p className="text-white font-semibold">{formatValue(alert.number_of_shares)}</p>
              </div>
              {alert.cap_raise_amount && (
                <div>
                  <p className="text-sm text-gray-400 mb-1">Cap Raise Amount</p>
                  <p className="text-white font-semibold">
                    {formatCurrencyValue(alert.cap_raise_amount.toString())}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Overallotment & Additional Dilutions */}
          {(alert.overallotment_shares || alert.overallotment_amount || alert.private_placement_shares || alert.additional_dilutions) && (
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-4">Additional Dilutions</h3>
              <div className="space-y-2">
                {alert.overallotment_shares && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Overallotment Shares:</span>
                    <span className="text-white">{formatValue(alert.overallotment_shares)}</span>
                  </div>
                )}
                {alert.overallotment_amount && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Overallotment Amount:</span>
                    <span className="text-white">{formatCurrencyValue(alert.overallotment_amount)}</span>
                  </div>
                )}
                {alert.private_placement_shares && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Private Placement Shares:</span>
                    <span className="text-white">{formatValue(alert.private_placement_shares)}</span>
                  </div>
                )}
                {alert.private_placement_amount && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Private Placement Amount:</span>
                    <span className="text-white">{formatCurrencyValue(alert.private_placement_amount)}</span>
                  </div>
                )}
                {alert.additional_dilutions && (
                  <div className="mt-2 pt-2 border-t border-gray-700">
                    <p className="text-sm text-gray-400 mb-1">Additional Info:</p>
                    <p className="text-white text-sm">{formatValue(alert.additional_dilutions)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Warrants */}
          {alert.warrants_found && (
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-4">Warrants</h3>
              <div className="space-y-2">
                {alert.warrant_coverage && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Warrant Coverage:</span>
                    <span className="text-white font-semibold">{alert.warrant_coverage}</span>
                  </div>
                )}
                {alert.warrants_per_share && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Warrants Per Share:</span>
                    <span className="text-white">{formatValue(alert.warrants_per_share)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Has Warrants:</span>
                  <span className="text-white">{alert.has_warrants ? "Yes" : "No"}</span>
                </div>
              </div>
            </div>
          )}

          {/* Toxic Debt */}
          {alert.toxic_debt_detected && alert.toxic_debt_snippet && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
              <h3 className="font-semibold text-red-400 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Toxic Debt Detected
              </h3>
              <p className="text-gray-300 text-sm whitespace-pre-wrap">
                {formatValue(alert.toxic_debt_snippet)}
              </p>
            </div>
          )}

          {/* Management Turnover */}
          {alert.management_turnover && alert.resignation_snippet && (
            <div className="bg-orange-900/20 border border-orange-800 rounded-lg p-4">
              <h3 className="font-semibold text-orange-400 mb-2 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Management Turnover Detected
              </h3>
              <p className="text-gray-300 text-sm whitespace-pre-wrap">
                {formatValue(alert.resignation_snippet)}
              </p>
            </div>
          )}

          {/* Red Flags Found */}
          {alert.red_flags_found && (
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-4">Red Flag Keywords Found</h3>
              <div className="flex flex-wrap gap-2">
                {alert.red_flags_found.split(',').map((flag, idx) => (
                  <span key={idx} className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded">
                    {flag.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Link to Filing */}
          {alert.link_to_filing && (
            <div className="pt-4 border-t border-gray-700">
              <a
                href={alert.link_to_filing}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View Full SEC Filing
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
