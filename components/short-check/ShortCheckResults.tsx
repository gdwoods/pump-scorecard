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
}

export default function ShortCheckResults({
  result,
  ticker,
  extractedData,
}: ShortCheckResultsProps) {
  const [showScoringGuide, setShowScoringGuide] = useState(false);
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

  const downloadAlertCard = () => {
    const blob = new Blob([result.alertCard], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ticker || "short-check"}_alert_card.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Simple feedback - could be enhanced with toast notification
      const button = document.activeElement as HTMLElement;
      const originalText = button.textContent;
      button.textContent = "✓ Copied!";
      setTimeout(() => {
        if (button) button.textContent = originalText;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
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

  return (
    <div className="space-y-6">
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
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-base font-semibold opacity-90">
                📋 Risk Synopsis
              </h3>
              <Button
                onClick={() => copyToClipboard(generateRiskSynopsis(ticker, result.scoreBreakdown, extractedData), "Risk Synopsis")}
                className="text-xs h-7 px-2"
                variant="outline"
              >
                📋 Copy
              </Button>
            </div>
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
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Alert Card</h2>
          <div className="flex gap-2">
            <Button
              onClick={() => copyToClipboard(result.alertCard, "Alert Card")}
              className="text-sm"
              variant="outline"
            >
              📋 Copy
            </Button>
            <Button onClick={downloadAlertCard} className="text-sm">
              💾 Download
            </Button>
          </div>
        </div>
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

