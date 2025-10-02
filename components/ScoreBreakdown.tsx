"use client";

interface ScoreBreakdownProps {
  ticker: string;
  breakdown: { label: string; value: number }[];
  total: number;
}

export default function ScoreBreakdown({
  ticker,
  breakdown,
  total,
}: ScoreBreakdownProps) {
  if (!breakdown || breakdown.length === 0) return null;

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-sm">
      <h2 className="text-lg font-semibold mb-3">
        📊 {ticker.toUpperCase()} Score Breakdown
      </h2>

      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {breakdown.map((item, i) => (
          <div
            key={i}
            className="flex justify-between py-1.5 text-sm"
          >
            {/* Label (red tint for risk factors) */}
            <span className="text-gray-800 dark:text-gray-200">
              {item.label}
            </span>

            {/* Score number */}
            <span className="font-semibold text-red-600 dark:text-red-400">
              +{item.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between font-bold text-sm">
        <span>Total Risk Score</span>
        <span>{total}</span>
      </div>
    </div>
  );
}
