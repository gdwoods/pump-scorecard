"use client";

import { Card } from "@/components/ui/card";
import { ScoreBreakdown } from "@/lib/shortCheckScoring";
import { ExtractedData } from "@/lib/shortCheckTypes";
import { getRedFlagTags, getCategoryExplanation } from "@/lib/shortCheckHelpers";
import { Tooltip } from "@/components/ui/tooltip";

interface ShortCheckScoreBreakdownProps {
  breakdown: ScoreBreakdown;
  total: number;
  data: ExtractedData;
}

export default function ShortCheckScoreBreakdown({
  breakdown,
  total,
  data,
}: ShortCheckScoreBreakdownProps) {
  const items = [
    { label: "Cash Need", value: breakdown.cashNeed, max: 25, actualValue: breakdown.actualValues?.cashNeed },
    { label: "Cash Runway", value: breakdown.cashRunway, max: 15, min: -10, actualValue: breakdown.actualValues?.cashRunway },
    { label: "Offering Ability", value: breakdown.offeringAbility, max: 25, min: -30, actualValue: breakdown.actualValues?.offeringAbility },
    { label: "Historical Dilution", value: breakdown.historicalDilution, max: 10, actualValue: breakdown.actualValues?.historicalDilution },
    { label: "Institutional Ownership", value: breakdown.institutionalOwnership, max: 5, min: -5, actualValue: breakdown.actualValues?.institutionalOwnership },
    { label: "Short Interest", value: breakdown.shortInterest, max: 15, min: -5, actualValue: breakdown.actualValues?.shortInterest },
    { label: "News Catalyst", value: breakdown.newsCatalyst, max: 15, min: -10, actualValue: breakdown.actualValues?.newsCatalyst },
    { label: "Float", value: breakdown.float, max: 10, min: -10, actualValue: breakdown.actualValues?.float },
    { label: "Overall Risk", value: breakdown.overallRisk, max: 10, actualValue: breakdown.actualValues?.overallRisk },
    { label: "Price Spike", value: breakdown.priceSpike, max: 10, actualValue: breakdown.actualValues?.priceSpike },
    { label: "Debt/Cash Ratio", value: breakdown.debtToCash, max: 10, actualValue: breakdown.actualValues?.debtToCash },
  ];

  const valueColor = (value: number, max: number, min?: number) => {
    // Handle negative values
    if (value < 0) return "text-green-500 dark:text-green-400"; // Negative = good for short (green)
    
    const percentage = (value / max) * 100;
    if (percentage >= 80) return "text-red-500 dark:text-red-400";
    if (percentage >= 50) return "text-orange-500 dark:text-orange-400";
    return "text-yellow-500 dark:text-yellow-400";
  };

  const totalColor =
    total >= 70
      ? "text-red-500 dark:text-red-400"
      : total >= 40
      ? "text-yellow-400 dark:text-yellow-300"
      : total >= 20
      ? "text-blue-400 dark:text-blue-300"
      : "text-green-400 dark:text-green-300";

  return (
    <Card className="p-4 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl">
      <h2 className="text-lg font-semibold mb-4 flex items-center">
        <span className="mr-2">📊</span> Score Breakdown
      </h2>

      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {items.map((item, i) => {
          const min = item.min ?? 0;
          const max = item.max;
          const range = max - min;
          const normalizedValue = item.value - min;
          const percentage = range > 0 ? (normalizedValue / range) * 100 : 0;
          
          const redFlag = getRedFlagTags(item.label, breakdown, data);
          const explanation = getCategoryExplanation(item.label);
          
          return (
            <div key={i} className="flex justify-between items-center py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-800 dark:text-gray-200">{item.label}</span>
                {redFlag && (
                  <Tooltip content={redFlag.tooltip} side="right">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                        redFlag.color === 'red'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                          : redFlag.color === 'orange'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                      }`}
                    >
                      {redFlag.icon} {redFlag.label}
                    </span>
                  </Tooltip>
                )}
                <Tooltip content={explanation.explanation} side="right">
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                    aria-label={`Learn more about ${item.label}`}
                  >
                    <span className="text-xs">ℹ️</span>
                  </button>
                </Tooltip>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2 relative">
                  {item.value < 0 ? (
                    // Negative value: show green bar from right
                    <div
                      className="h-2 rounded-full bg-green-500 absolute right-0"
                      style={{ 
                        width: `${Math.min(100, Math.abs(item.value / Math.abs(min)) * 100)}%` 
                      }}
                    />
                  ) : (
                    // Positive value: show colored bar from left
                    <div
                      className={`h-2 rounded-full ${
                        percentage >= 80
                          ? "bg-red-500"
                          : percentage >= 50
                          ? "bg-orange-500"
                          : "bg-yellow-500"
                      }`}
                      style={{ width: `${Math.min(100, percentage)}%` }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`${valueColor(item.value, item.max, item.min)} font-medium w-20 text-right`}>
                    {item.value >= 0 ? '+' : ''}{item.value.toFixed(1)}
                    {item.max > 0 && ` / ${item.max}`}
                  </span>
                  {item.actualValue && (
                    <span className="text-gray-500 dark:text-gray-400 text-xs">
                      ({item.actualValue})
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-right">
        <span className="text-gray-500 dark:text-gray-400 mr-2 text-sm">
          Total Rating:
        </span>
        <span className={`${totalColor} text-2xl font-bold`}>{total.toFixed(1)}%</span>
      </div>
    </Card>
  );
}

