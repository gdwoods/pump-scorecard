"use client";

import { Card } from "@/components/ui/card";

interface BreakdownItem {
  label: string;
  value: number;
}

interface Props {
  ticker: string;
  breakdown: BreakdownItem[];
  total: number;
}

export default function ScoreBreakdown({ ticker, breakdown, total }: Props) {
  // Assign color to each value (+ = red / - = green)
  const valueColor = (value: number) =>
    value > 0
      ? "text-red-500 dark:text-red-400"
      : value < 0
      ? "text-green-400 dark:text-green-300"
      : "text-gray-400 dark:text-gray-500";

  // Label color (make it a bit muted but readable)
  const labelColor = "text-gray-800 dark:text-gray-200";

  // Color for total score
  const totalColor =
    total >= 70
      ? "text-red-500 dark:text-red-400"
      : total >= 40
      ? "text-yellow-400 dark:text-yellow-300"
      : "text-green-400 dark:text-green-300";

  return (
    <Card
      id="score-breakdown"
      className="p-4 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl"
    >
      {/* Title */}
      <h2 className="text-lg font-semibold mb-4 flex items-center">
        <span className="mr-2">🔍</span> Score Breakdown —{" "}
        <span className="ml-1 text-blue-500 dark:text-blue-400">
          {ticker.toUpperCase()}
        </span>
      </h2>

      {/* Breakdown list */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {breakdown.length > 0 ? (
          breakdown.map((item, i) => (
            <div
              key={i}
              className="flex justify-between py-2 text-sm"
            >
              <span className={labelColor}>{item.label}</span>
              <span className={`${valueColor(item.value)} font-medium`}>
                {item.value > 0 ? "+" : ""}
                {item.value}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500 italic">
            No active risk factors found.
          </p>
        )}
      </div>

      {/* Total Score */}
      <div className="mt-4 text-right font-semibold text-sm">
        <span className="text-gray-500 dark:text-gray-400 mr-1">
          Total Risk Score:
        </span>
        <span className={`${totalColor} text-base font-bold`}>{total}</span>
      </div>
    </Card>
  );
}
