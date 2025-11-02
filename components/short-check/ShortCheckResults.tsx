"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ShortCheckScoreBreakdown from "./ShortCheckScoreBreakdown";
import ScoringGuideModal from "./ScoringGuideModal";
import { ShortCheckResult } from "@/lib/shortCheckScoring";
import { ExtractedData } from "@/lib/shortCheckTypes";
import { generateRiskSynopsis } from "@/lib/shortCheckHelpers";

interface ShortCheckResultsProps {
  result: ShortCheckResult;
  ticker?: string;
  extractedData?: ExtractedData;
  pumpScorecardData?: any; // Pump Scorecard data to include in PDF
}

export default function ShortCheckResults({
  result,
  ticker,
  extractedData,
  pumpScorecardData,
}: ShortCheckResultsProps) {
  const [showScoringGuide, setShowScoringGuide] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const categoryColors = {
    "High-Priority Short Candidate": "bg-red-500 text-white",
    "Moderate Short Candidate": "bg-yellow-500 text-white",
    "Speculative Short Candidate": "bg-blue-500 text-white",
    "No-Trade": "bg-green-500 text-white",
  };

  const categoryBgColors = {
    "High-Priority Short Candidate": "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
    "Moderate Short Candidate": "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
    "Speculative Short Candidate": "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    "No-Trade": "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
  };


  const getQuickStats = () => {
    if (!extractedData) return null;
    const stats = [];
    
    // Match DT's order: Overall Risk, Offering Ability, Overhead Supply, Historical, Cash Need
    // 1. Overall Risk
    if (extractedData.overallRiskStatus) {
      const status = extractedData.overallRiskStatus.replace('DT:', '').toLowerCase();
      const label = status === 'red' || status === 'high' ? 'High' : status === 'yellow' || status === 'medium' ? 'Medium' : 'Low';
      const color = status === 'red' || status === 'high' ? 'text-red-600 dark:text-red-400' : status === 'yellow' || status === 'medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400';
      stats.push({ label: "Overall Risk", value: label, color });
    }
    
    // 2. Offering Ability
    if (extractedData.atmShelfStatus) {
      const status = extractedData.atmShelfStatus.replace('DT:', '').toLowerCase();
      let label = status;
      if (status.includes('red') || status.includes('high') || status.includes('active')) {
        label = 'High';
      } else if (status.includes('yellow') || status.includes('medium')) {
        label = 'Medium';
      } else if (status.includes('green') || status.includes('low')) {
        label = 'Low';
      } else {
        // Fallback: check if it contains active dilution indicators
        if (status.includes('atm') || status.includes('s-1') || status.includes('equity line') || status.includes('convertible')) {
          label = 'High';
        } else {
          label = 'Low';
        }
      }
      const color = label === 'High' ? 'text-red-600 dark:text-red-400' : label === 'Medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400';
      stats.push({ label: "Offering Ability", value: label, color });
    }
    
    // 3. Overhead Supply
    if (extractedData.overheadSupplyStatus) {
      const status = extractedData.overheadSupplyStatus.replace('DT:', '').toLowerCase();
      const label = status === 'red' || status === 'high' ? 'High' : status === 'yellow' || status === 'medium' ? 'Medium' : 'Low';
      const color = status === 'red' || status === 'high' ? 'text-red-600 dark:text-red-400' : status === 'yellow' || status === 'medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400';
      stats.push({ label: "Overhead Supply", value: label, color });
    }
    
    // 4. Historical (Dilution)
    if (extractedData.historicalDilutionStatus) {
      const status = extractedData.historicalDilutionStatus.replace('DT:', '').toLowerCase();
      const label = status === 'red' || status === 'high' ? 'High' : status === 'yellow' || status === 'medium' ? 'Medium' : 'Low';
      const color = status === 'red' || status === 'high' ? 'text-red-600 dark:text-red-400' : status === 'yellow' || status === 'medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400';
      stats.push({ label: "Historical", value: label, color });
    }
    
    // 5. Cash Need
    if (extractedData.cashNeedStatus) {
      const status = extractedData.cashNeedStatus.replace('DT:', '').toLowerCase();
      const label = status === 'red' || status === 'high' ? 'High' : status === 'yellow' || status === 'medium' ? 'Medium' : 'Low';
      const color = status === 'red' || status === 'high' ? 'text-red-600 dark:text-red-400' : status === 'yellow' || status === 'medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400';
      stats.push({ label: "Cash Need", value: label, color });
    }
    
    return stats.length > 0 ? stats : null;
  };

  const getQuickActionLinks = () => {
    if (!ticker) return null;
    const upperTicker = ticker.toUpperCase();
    
    return {
      tradingView: `https://www.tradingview.com/chart/?symbol=${upperTicker}`,
      finviz: `https://finviz.com/quote.ashx?t=${upperTicker}`,
      secEdgar: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${upperTicker}`,
    };
  };

  const quickLinks = getQuickActionLinks();

  const handleShare = async () => {
    if (!ticker || !extractedData || !result) return;

    setSharing(true);
    try {
      const response = await fetch("/api/share/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker,
          extractedData,
          result,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate share link");
      }

      const data = await response.json();
      setShareUrl(data.shareUrl);

      // Copy to clipboard
      await navigator.clipboard.writeText(data.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (error) {
      console.error("Error sharing:", error);
      alert("Failed to generate share link. Please try again.");
    } finally {
      setSharing(false);
    }
  };

  const handleExportPDF = async () => {
    if (!ticker || !result) return;

    setExportingPDF(true);
    try {
      const response = await fetch("/api/short-check/export-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker,
          result,
          extractedData,
          pumpScorecardData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to generate PDF (${response.status})`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `short-check-${ticker}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting PDF:", error);
      alert("Failed to export PDF. Please try again.");
    } finally {
      setExportingPDF(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions Toolbar */}
      {quickLinks && ticker && (
        <Card className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Quick Actions:
            </span>
            <a
              href={quickLinks.tradingView}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-md transition-colors"
            >
              <span>📈</span>
              TradingView
            </a>
            <a
              href={quickLinks.finviz}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors"
            >
              <span>📊</span>
              Finviz
            </a>
            <a
              href={quickLinks.secEdgar}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md transition-colors"
            >
              <span>📄</span>
              SEC EDGAR
            </a>
            <button
              onClick={handleShare}
              disabled={sharing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
            >
              {sharing ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Generating...
                </>
              ) : copied ? (
                <>
                  <span>✅</span>
                  Copied!
                </>
              ) : (
                <>
                  <span>🔗</span>
                  Share
                </>
              )}
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exportingPDF}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
            >
              {exportingPDF ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Generating...
                </>
              ) : (
                <>
                  <span>📄</span>
                  Export PDF
                </>
              )}
            </button>
          </div>
          {shareUrl && (
            <div className="mt-3 p-2 bg-white dark:bg-gray-900 rounded border border-gray-300 dark:border-gray-600">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                Share link (valid for 7 days):
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded font-mono"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded transition-colors"
                >
                  {copied ? "✓" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Main Rating Card */}
      <Card
        className={`p-4 md:p-6 shadow-lg border-2 ${categoryBgColors[result.category]}`}
      >
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <h2 className="text-xl md:text-2xl font-bold">
              {ticker ? `${ticker} — ` : ""}Short Rating
            </h2>
            <button
              onClick={() => setShowScoringGuide(true)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              aria-label="How scoring works"
              title="How scoring works"
            >
              <span className="text-lg">ℹ️</span>
            </button>
          </div>
          <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
            <div className="text-5xl md:text-6xl font-bold">{result.rating.toFixed(1)}%</div>
            {result.alertLabels && result.alertLabels.length > 0 && (
              <div className="flex gap-2 flex-wrap justify-center">
                {result.alertLabels.map((alert, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      alert.color === 'red'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        : alert.color === 'orange'
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                    }`}
                  >
                    {alert.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div
            className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${categoryColors[result.category]}`}
          >
            {result.category}
          </div>
        </div>

        {/* Risk Synopsis - Combined into top card */}
        {extractedData && (
          <div className="mt-6 p-4 bg-white/50 dark:bg-black/20 border border-current/20 rounded-lg">
            <h3 className="text-base font-semibold opacity-90 mb-2">
              📋 Risk Synopsis
            </h3>
            <p className="text-sm leading-relaxed opacity-80">
              {generateRiskSynopsis(ticker, result.scoreBreakdown, extractedData)}
            </p>
          </div>
        )}

        {result.walkAwayFlags.length > 0 && (
          <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <h3 className="font-semibold text-red-800 dark:text-red-300 mb-2">
              ⚠️ Walk-Away Flags
            </h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-red-700 dark:text-red-400">
              {result.walkAwayFlags.map((flag, i) => (
                <li key={i}>{flag}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Quick Stats - DT Card Values */}
      {extractedData && getQuickStats() && (
        <Card className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {getQuickStats()?.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{stat.label}</div>
                <div className={`text-lg font-semibold ${stat.color || 'text-gray-900 dark:text-gray-100'}`}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Score Breakdown */}
      <ShortCheckScoreBreakdown
        breakdown={result.scoreBreakdown}
        total={result.rating}
        data={extractedData || { confidence: 0 }}
      />

      {/* Alert Card */}
      <Card className="p-6 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold mb-4">Alert Card</h2>
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap">
          {result.alertCard}
        </div>
      </Card>

      {/* Scoring Guide Modal */}
      <ScoringGuideModal
        isOpen={showScoringGuide}
        onClose={() => setShowScoringGuide(false)}
      />
    </div>
  );
}

