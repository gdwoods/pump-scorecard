"use client";

interface Props {
  ticker: string;
  breakdown: { label: string; value: number }[];
  total: number;
}

export default function ScoreBreakdown({ ticker, breakdown, total }: Props) {
  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-sm">
      <h2 className="text-lg font-semibold mb-3">
        📊 {ticker?.toUpperCase()} Score Breakdown
      </h2>

      {breakdown.length === 0 ? (
        <p className="text-sm text-gray-500">No breakdown available</p>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {breakdown.map((item, i) => (
            <div
              key={i}
              className="flex justify-between py-2 text-sm"
            >
              <span className="text-red-600">{item.label}</span>
              <span className="text-red-600 font-medium">
                +{item.value}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 font-semibold flex justify-between">
        <span>Total Adjusted Score</span>
        <span>{total}/100</span>
      </div>
    </div>
  );
}
