"use client";

export default function FinalVerdict({
  verdict,
  summary,
  score,
  manualFlags,
  droppinessVerdict,
}: {
  verdict: string;
  summary: string;
  score: number;
  manualFlags: Record<string, boolean>;
  droppinessVerdict?: string;
}) {
  // ✅ Compute adjusted verdict from score
  let adjustedVerdict: "Low risk" | "Moderate risk" | "High risk" = "Low risk";
  if (score >= 70) adjustedVerdict = "High risk";
  else if (score >= 40) adjustedVerdict = "Moderate risk";

  // ✅ Background color by verdict
  const bg =
    adjustedVerdict === "High risk"
      ? "bg-red-50 border-red-400"
      : adjustedVerdict === "Moderate risk"
      ? "bg-yellow-50 border-yellow-400"
      : "bg-green-50 border-green-400";

  return (
    <div className={`p-4 border rounded-lg shadow-sm ${bg}`}>
      <h2 className="text-xl font-bold mb-2">🚨 Final Verdict</h2>

      <p className="mb-2">
        <span className="font-semibold">Verdict:</span>{" "}
        <span
          className={
            adjustedVerdict === "High risk"
              ? "text-red-600"
              : adjustedVerdict === "Moderate risk"
              ? "text-yellow-600"
              : "text-green-600"
          }
        >
          {adjustedVerdict}
        </span>
      </p>

      <p className="mb-2">
        <span className="font-semibold">Score:</span> {score} / 100
      </p>

      {/* Summary text */}
      <p className="mb-2">{summary}</p>

      {/* ✅ Droppiness verdict fully integrated */}
      {droppinessVerdict && (
        <p className="mt-3 text-sm text-gray-700">
          <span className="font-semibold">Droppiness:</span> {droppinessVerdict}
        </p>
      )}
    </div>
  );
}
