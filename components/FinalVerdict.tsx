"use client";

type Props = {
  verdict: "Low risk" | "Moderate risk" | "High risk";
  summary: string;
  score: number;
  manualFlags: Record<string, boolean>;
  droppinessVerdict: string;
};

export default function FinalVerdict({
  verdict,
  summary,
  score,
  manualFlags,
  droppinessVerdict,
}: Props) {
  const color =
    verdict === "High risk"
      ? "bg-red-600"
      : verdict === "Moderate risk"
      ? "bg-yellow-500"
      : "bg-green-600";

  const badgeColor =
    verdict === "High risk"
      ? "bg-red-100 text-red-800"
      : verdict === "Moderate risk"
      ? "bg-yellow-100 text-yellow-800"
      : "bg-green-100 text-green-800";

  return (
    <div className="p-6 border rounded-lg bg-white dark:bg-gray-800 shadow">
      {/* Verdict Banner */}
      <div className={`text-white text-lg font-semibold px-4 py-2 rounded ${color}`}>
        {verdict}
      </div>

      {/* Score Gauge */}
      <div className="mt-4">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
          <div
            className={`h-4 rounded-full ${color}`}
            style={{ width: `${score}%` }}
          />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          Risk Score: <span className="font-medium">{score}%</span>
        </p>
      </div>

      {/* Summary */}
      <p className="mt-4 text-gray-800 dark:text-gray-200 text-sm">{summary}</p>

      {/* Droppiness Verdict */}
      <p className="mt-2 text-gray-600 dark:text-gray-400 text-sm italic">
        {droppinessVerdict}
      </p>

      {/* Manual Flags */}
      {Object.keys(manualFlags).some((k) => manualFlags[k]) && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-1">Manual Flags</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(manualFlags)
              .filter(([_, v]) => v)
              .map(([k]) => (
                <span
                  key={k}
                  className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800"
                >
                  {k}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
