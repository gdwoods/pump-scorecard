"use client";

interface Props {
  verdict: string;
  summary: string;
  score: number;
  manualFlags?: Record<string, boolean>;
}

export default function FinalVerdict({ verdict, summary, score, manualFlags = {} }: Props) {
  // Count how many manual flags are true
  const manualCount = Object.values(manualFlags).filter(Boolean).length;

  // Each manual flag adds 5% risk (adjust if you want a different weight)
  const adjustedScore = Math.min(100, score + manualCount * 5);

  let riskLabel = "Low risk";
  let boxColor = "bg-green-100 border-green-400 text-green-800";

  if (adjustedScore >= 70) {
    riskLabel = "High risk";
    boxColor = "bg-red-100 border-red-400 text-red-800";
  } else if (adjustedScore >= 40) {
    riskLabel = "Moderate risk";
    boxColor = "bg-yellow-100 border-yellow-400 text-yellow-800";
  }

  return (
    <div className={`p-4 rounded-lg border ${boxColor}`}>
      <h2 className="text-lg font-bold mb-1">📌 Final Verdict</h2>
      <p className="text-base">{verdict}</p>
      {summary && <p className="text-sm text-gray-700 mt-1">{summary}</p>}
      <p className="text-sm font-semibold mt-2">
        Risk Level: {riskLabel}
      </p>
      <p className="text-sm font-semibold">
        Score: {adjustedScore}%
      </p>
    </div>
  );
}
