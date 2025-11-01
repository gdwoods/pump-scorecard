"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import Criteria from "@/components/Criteria";
import FinalVerdict from "@/components/FinalVerdict";

interface CombinedPumpRiskCardProps {
  ticker: string;
  pumpScorecardData: any; // Full result from /api/scan/[ticker]
  manualFlags: Record<string, boolean>;
  toggleManualFlag: (key: string) => void;
}

export default function CombinedPumpRiskCard({
  ticker,
  pumpScorecardData,
  manualFlags,
  toggleManualFlag,
}: CombinedPumpRiskCardProps) {
  const [activeTab, setActiveTab] = useState<"verdict" | "breakdown" | "criteria">("verdict");

  if (!pumpScorecardData) {
    return (
      <Card className="p-6 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl">
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Loading Pump Risk analysis...
        </p>
      </Card>
    );
  }

  // Calculate score breakdown exactly like Pump Scorecard does
  const calculateScoreBreakdown = () => {
    if (!pumpScorecardData) return [];

    let score = pumpScorecardData.weightedRiskScore ?? 0;
    const breakdown: Array<{ label: string; value: number; color?: string; actualValue?: string | number }> = [];

    // --- Base model (only once)
    breakdown.push({
      label: "Base model risk",
      value: score,
      color: "text-gray-400 italic",
    });

    // --- Auto fundamentals
    if (pumpScorecardData.marketCap && pumpScorecardData.marketCap < 50_000_000) {
      score += 10;
      const marketCapFormatted = pumpScorecardData.marketCap >= 1_000_000 
        ? `$${(pumpScorecardData.marketCap / 1_000_000).toFixed(1)}M`
        : `$${(pumpScorecardData.marketCap / 1_000).toFixed(0)}K`;
      breakdown.push({ 
        label: "Microcap (<$50M)", 
        value: 10, 
        color: "text-red-400",
        actualValue: marketCapFormatted
      });
    }

    if (pumpScorecardData.shortFloat && pumpScorecardData.shortFloat > 20) {
      score += 10;
      breakdown.push({
        label: "High short float (>20%)",
        value: 10,
        color: "text-red-400",
        actualValue: `${pumpScorecardData.shortFloat.toFixed(1)}%`
      });
    }

    if (pumpScorecardData.insiderOwnership && pumpScorecardData.insiderOwnership > 50) {
      score += 5;
      breakdown.push({
        label: "High insider ownership (>50%)",
        value: 5,
        color: "text-red-400",
        actualValue: `${pumpScorecardData.insiderOwnership.toFixed(1)}%`
      });
    }

    // --- Droppiness behavior (exact logic from Pump Scorecard)
    if (pumpScorecardData.droppinessScore !== undefined && pumpScorecardData.droppinessScore < 40) {
      score += 10;
      breakdown.push({
        label: "Spikes hold (risky behavior)",
        value: 10,
        color: "text-red-400",
        actualValue: `${pumpScorecardData.droppinessScore.toFixed(0)}`
      });
    } else if (pumpScorecardData.droppinessScore !== undefined && pumpScorecardData.droppinessScore > 70) {
      score -= 5;
      breakdown.push({
        label: "Spikes fade quickly (less risky)",
        value: -5,
        color: "text-green-400",
        actualValue: `${pumpScorecardData.droppinessScore.toFixed(0)}`
      });
    }

    // --- Promotions (<30 days)
    if (pumpScorecardData.recentPromotions?.length > 0) {
      score += 15;
      breakdown.push({
        label: "Recent promotion (<30d)",
        value: 15,
        color: "text-red-400",
        actualValue: `${pumpScorecardData.recentPromotions.length} found`
      });
    }

    // --- Manual flags
    if (manualFlags.pumpSuspicion) {
      score += 15;
      breakdown.push({
        label: "Pump suspicion (manual)",
        value: 15,
        color: "text-red-400",
      });
    }

    if (manualFlags.thinFloat) {
      score += 10;
      breakdown.push({
        label: "Thin float (manual)",
        value: 10,
        color: "text-red-400",
      });
    }

    if (manualFlags.insiders) {
      score += 10;
      breakdown.push({
        label: "Shady insiders (manual)",
        value: 10,
        color: "text-red-400",
      });
    }

    if (manualFlags.other) {
      score += 5;
      breakdown.push({
        label: "Other red flag (manual)",
        value: 5,
        color: "text-red-400",
      });
    }

    // --- Clamp to 0–100
    score = Math.max(0, Math.min(score, 100));

    // ✅ Add final adjusted score
    breakdown.push({
      label: "Final adjusted score",
      value: score,
      color: "text-gray-300 font-semibold",
    });

    return breakdown;
  };

  const scoreBreakdown = calculateScoreBreakdown();
  // Total score is the last item (Final adjusted score)
  const totalScore = scoreBreakdown.length > 0 ? scoreBreakdown[scoreBreakdown.length - 1].value : 0;

  // Determine verdict (must match FinalVerdict type)
  const getVerdict = (score: number): "Low risk" | "Moderate risk" | "High risk" => {
    if (score >= 70) return "High risk";
    if (score >= 40) return "Moderate risk";
    return "Low risk";
  };

  const verdict = getVerdict(totalScore);

  return (
    <Card className="p-6 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            📊 Pump Risk Scorecard
          </h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Comprehensive risk analysis based on fundamentals, SEC filings, promotions, fraud evidence, and historical price behavior
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("verdict")}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === "verdict"
              ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          }`}
        >
          🎯 Risk Verdict
        </button>
        <button
          onClick={() => setActiveTab("breakdown")}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === "breakdown"
              ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          }`}
        >
          📊 Score Breakdown
        </button>
        <button
          onClick={() => setActiveTab("criteria")}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === "criteria"
              ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          }`}
        >
          ✅ Criteria
        </button>
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {activeTab === "verdict" && (
          <FinalVerdict
            verdict={verdict}
            summary={`Pump Risk analysis for ${ticker.toUpperCase()}`}
            score={totalScore}
            manualFlags={manualFlags}
            droppinessVerdict={pumpScorecardData.droppinessVerdict || ""}
            scoreLog={scoreBreakdown.map(item => ({
              label: item.label,
              value: item.value,
              color: item.color || (item.value > 0 ? "text-red-400" : item.value < 0 ? "text-green-400" : "text-gray-400"),
            }))}
            baseScore={pumpScorecardData.weightedRiskScore || 0}
          />
        )}

        {activeTab === "breakdown" && (
          <ScoreBreakdown
            ticker={ticker}
            breakdown={scoreBreakdown.map(item => ({
              label: item.label,
              value: item.value,
              actualValue: item.actualValue,
            }))}
            total={totalScore}
          />
        )}

        {activeTab === "criteria" && (
          <Criteria
            ticker={ticker}
            result={pumpScorecardData}
            manualFlags={manualFlags}
            toggleManualFlag={toggleManualFlag}
          />
        )}
      </div>
    </Card>
  );
}

