// components/ScoreBreakdown.tsx
"use client";

export default function ScoreBreakdown({
  ticker,
  breakdown,
  total,
}: {
  ticker: string;
  breakdown: { label: string; value: number }[];
  total: number;
}) {
  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-sm">
      <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
        🔍 Score Breakdown — {ticker}
      </h2>

      {breakdown.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          ✅ No significant red flags detected.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {breakdown.map((item, i) => (
            <li key={i} className="flex justify-between">
              <span>{item.label}</span>
              <span className="font-bold text-red-600 dark:text-red-400">
                +{item.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 text-right font-semibold">
        Total Risk Score:{" "}
        <span
          className={`${
            total >= 70
              ? "text-red-600 dark:text-red-400"
              : total >= 40
              ? "text-yellow-600 dark:text-yellow-400"
              : "text-green-600 dark:text-green-400"
          }`}
        >
          {total}
        </span>
      </div>
    </div>
  );
}
