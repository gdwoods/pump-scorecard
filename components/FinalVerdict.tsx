"use client";

type Props = {
  verdict: "Low risk" | "Moderate risk" | "High risk";
  summary: string;
  score: number;
  manualFlags: Record<string, boolean>;
  droppinessVerdict: string;
  drivers?: { label: string; value: number }[];
};

export default function FinalVerdict({
  verdict,
  summary,
  score,
  manualFlags,
  droppinessVerdict,
  drivers = [],
}: Props) {
  // Dynamic colors
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

  // 🧠 Descriptive commentary based on score
  let description = "";
  if (score <= 25) {
    description =
      "No major pump indicators. Price and volume appear organic with limited speculative activity.";
  } else if (score <= 50) {
    description =
      "Some speculative activity detected, but not excessive. Worth watching for signs of acceleration or promotion.";
  } else if (score <= 75) {
    description =
      "Several pump-like risk factors are present — such as volume spikes, dilution filings, or promotions. Exercise caution.";
  } else {
    description =
      "Multiple red flags detected — high dilution, aggressive promotions, and abnormal trading patterns suggest elevated pump-and-dump risk.";
  }

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

      {/* Description */}
      <p className="mt-4 text-gray-800 dark:text-gray-200 text-sm">
        {description}
      </p>

      {/* Summary (backend insight) */}
      <p className="mt-2 text-gray-700 dark:text-gray-300 text-sm">{summary}</p>

      {/* Droppiness Verdict */}
      <p className="mt-2 text-gray-600 dark:text-gray-400 text-sm italic">
        {droppinessVerdict}
      </p>

      {/* ✅ Key Risk Drivers */}
      {drivers.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-1">Key Risk Drivers</h3>
          <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300">
            {drivers.map((d, i) => (
              <li key={i}>
                {d.label}{" "}
                <span className="text-red-500 font-medium">(+{d.value})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-gray-500 italic mt-2">
          No major red flags detected.
        </p>
      )}

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
