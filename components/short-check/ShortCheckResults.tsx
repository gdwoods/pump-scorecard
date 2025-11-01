"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ShortCheckScoreBreakdown from "./ShortCheckScoreBreakdown";
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
    if (extractedData.cashRunway !== undefined) {
      stats.push({ label: "Runway", value: `${extractedData.cashRunway.toFixed(1)}mo` });
    }
    if (extractedData.float !== undefined) {
      const float = extractedData.float < 1000 ? extractedData.float * 1_000_000 : extractedData.float;
      stats.push({ label: "Float", value: `${(float / 1_000_000).toFixed(1)}M` });
    }
    if (extractedData.institutionalOwnership !== undefined) {
      stats.push({ label: "Inst Own", value: `${extractedData.institutionalOwnership.toFixed(1)}%` });
    }
    if (extractedData.shortInterest !== undefined) {
      stats.push({ label: "Short Int", value: `${extractedData.shortInterest.toFixed(1)}%` });
    }
    return stats;
  };

  return (
    <div className="space-y-6">
      {/* Main Rating Card */}
      <Card
        className={`p-4 md:p-6 shadow-lg border-2 ${categoryBgColors[result.category]}`}
      >
        <div className="text-center">
          <h2 className="text-xl md:text-2xl font-bold mb-2">
            {ticker ? `${ticker} — ` : ""}Short Rating
          </h2>
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

      {/* Quick Stats */}
      {extractedData && getQuickStats() && (
        <Card className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {getQuickStats()?.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{stat.label}</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stat.value}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Risk Synopsis */}
      {extractedData && (
        <Card className="p-4 md:p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300">
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
          <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
            {generateRiskSynopsis(ticker, result.scoreBreakdown, extractedData)}
          </p>
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
    </div>
  );
}

