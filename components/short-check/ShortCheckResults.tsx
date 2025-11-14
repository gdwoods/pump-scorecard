"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ShortCheckScoreBreakdown from "./ShortCheckScoreBreakdown";
import ScoringGuideModal from "./ScoringGuideModal";
import { ShortCheckResult } from "@/lib/shortCheckScoring";
import { ExtractedData } from "@/lib/shortCheckTypes";
import { generateRiskSynopsis } from "@/lib/shortCheckHelpers";
import { generateFormattedSummary } from "@/lib/summaryGenerator";

interface ShortCheckResultsProps {
  result: ShortCheckResult;
  ticker?: string;
  extractedData?: ExtractedData;
  pumpScorecardData?: any; // Pump Scorecard data to include in PDF
  onTickerChange?: (newTicker: string) => void; // Callback when ticker is overridden
}

export default function ShortCheckResults({
  result,
  ticker,
  extractedData,
  pumpScorecardData,
  onTickerChange,
}: ShortCheckResultsProps) {
  const [showScoringGuide, setShowScoringGuide] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [copyingSummary, setCopyingSummary] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [tickerOverride, setTickerOverride] = useState<string>("");
  const [showTickerOverride, setShowTickerOverride] = useState(false);
  
  // Use override ticker if set, otherwise use original ticker
  const effectiveTicker = tickerOverride || ticker;
  const isSingleLetterTicker = effectiveTicker && effectiveTicker.length === 1;
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
    if (!effectiveTicker) return null;
    const upperTicker = effectiveTicker.toUpperCase();
    
    return {
      tradingView: `https://www.tradingview.com/chart/?symbol=${upperTicker}`,
      finviz: `https://finviz.com/quote.ashx?t=${upperTicker}`,
      secEdgar: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${upperTicker}`,
    };
  };

  const quickLinks = getQuickActionLinks();
  
  // Handle ticker override - fetch pump data when override is applied
  useEffect(() => {
    if (tickerOverride && tickerOverride !== ticker && tickerOverride.length >= 1) {
      // Trigger parent to fetch pump data with override ticker
      // This will be handled by the parent component
    }
  }, [tickerOverride, ticker]);

  const handleShare = async () => {
    if (!effectiveTicker || !extractedData || !result) return;

    setSharing(true);
    try {
      const response = await fetch("/api/share/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker: effectiveTicker,
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
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 3000);
    } catch (error) {
      console.error("Error sharing:", error);
      alert("Failed to generate share link. Please try again.");
    } finally {
      setSharing(false);
    }
  };

  const handleExportPDF = async () => {
    if (!effectiveTicker || !result) return;

    setExportingPDF(true);
    try {
      const response = await fetch("/api/short-check/export-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker: effectiveTicker,
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
      a.download = `short-check-${effectiveTicker}-${new Date().toISOString().split('T')[0]}.pdf`;
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

  const handleCopySummary = async () => {
    if (!effectiveTicker || !result) return;

    setCopyingSummary(true);
    try {
      const summary = generateFormattedSummary({
        ticker: effectiveTicker,
        result,
        extractedData,
        pumpScorecardData,
        format: 'full',
      });

      await navigator.clipboard.writeText(summary);
      setCopiedSummary(true);
      setTimeout(() => {
        setCopiedSummary(false);
        setCopyingSummary(false);
      }, 2000);
    } catch (error) {
      console.error("Error copying summary:", error);
      alert("Failed to copy summary. Please try again.");
      setCopyingSummary(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions Toolbar */}
      {quickLinks && effectiveTicker && (
        <Card className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3 flex-wrap">
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
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopySummary}
                disabled={copyingSummary}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                title="Copy complete analysis summary to clipboard"
              >
                {copyingSummary ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Copying...
                  </>
                ) : copiedSummary ? (
                  <>
                    <span>✅</span>
                    Copied!
                  </>
                ) : (
                  <>
                    <span>📋</span>
                    Copy Summary
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
                ) : copiedShare ? (
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
            </div>
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
                    setCopiedShare(true);
                    setTimeout(() => setCopiedShare(false), 2000);
                  }}
                  className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded transition-colors"
                >
                  {copiedShare ? "✓" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Ticker Override Warning and Input */}
      {isSingleLetterTicker && (
        <Card className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <strong className="text-yellow-800 dark:text-yellow-300 block mb-1">
                Single-Letter Ticker Detected
              </strong>
              <p className="text-yellow-700 dark:text-yellow-400 text-sm mb-3">
                The OCR detected "{ticker}" as the ticker symbol. Single-letter tickers are rare and may indicate a parsing error. 
                If this is incorrect, please enter the correct ticker below.
              </p>
              {!showTickerOverride ? (
                <button
                  onClick={() => setShowTickerOverride(true)}
                  className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded transition-colors"
                >
                  Correct Ticker
                </button>
              ) : (
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={tickerOverride}
                    onChange={(e) => setTickerOverride(e.target.value.toUpperCase())}
                    placeholder="Enter correct ticker (e.g., XPON)"
                    className="px-3 py-1.5 border border-yellow-300 dark:border-yellow-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 flex-1 max-w-xs"
                    maxLength={5}
                  />
                  <button
                    onClick={() => {
                      if (tickerOverride && tickerOverride.length >= 1) {
                        if (onTickerChange) {
                          onTickerChange(tickerOverride);
                        } else {
                          // Fallback: reload with query param
                          window.location.href = `/short-check?ticker=${tickerOverride}`;
                        }
                      }
                    }}
                    className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded transition-colors"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => {
                      setTickerOverride("");
                      setShowTickerOverride(false);
                    }}
                    className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-sm rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
      
      {/* Ticker Override Field (for any ticker, not just single-letter) */}
      {!isSingleLetterTicker && ticker && (
        <Card className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Detected ticker:</span>
            <span className="font-semibold">{ticker}</span>
            {!showTickerOverride ? (
              <button
                onClick={() => setShowTickerOverride(true)}
                className="ml-auto px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                Correct
              </button>
            ) : (
              <div className="ml-auto flex gap-2 items-center">
                <input
                  type="text"
                  value={tickerOverride}
                  onChange={(e) => setTickerOverride(e.target.value.toUpperCase())}
                  placeholder="Enter correct ticker"
                  className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm w-24"
                  maxLength={5}
                />
                <button
                  onClick={() => {
                    if (tickerOverride && tickerOverride.length >= 1) {
                      if (onTickerChange) {
                        onTickerChange(tickerOverride);
                      } else {
                        // Fallback: reload with query param
                        window.location.href = `/short-check?ticker=${tickerOverride}`;
                      }
                    }
                  }}
                  className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={() => {
                    setTickerOverride("");
                    setShowTickerOverride(false);
                  }}
                  className="px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Main Rating Card */}
      <Card
        className={`p-4 md:p-6 shadow-lg border-2 ${categoryBgColors[result.category]}`}
      >
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <h2 className="text-xl md:text-2xl font-bold">
              {effectiveTicker ? `${effectiveTicker} — ` : ""}Short Rating
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
              {generateRiskSynopsis(effectiveTicker || ticker, result.scoreBreakdown, extractedData)}
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

