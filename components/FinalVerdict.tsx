"use client";

import { useState } from "react";

import ScoreExplanation from "@/components/ScoreExplanation";

type Props = {
  verdict: "Low risk" | "Moderate risk" | "High risk";
  summary: string;
  score: number;
  manualFlags: Record<string, boolean>;
  droppinessVerdict: string;
  drivers?: { label: string; value: number }[];
  scoreLog?: { label: string; value: number; explanation?: string }[];
  baseScore?: number; // base model contribution
};

export default function FinalVerdict({
  verdict,
  summary,
  score,
  manualFlags,
  droppinessVerdict,
  drivers = [],
  scoreLog = [],
  baseScore = 0,
}: Props) {
  const [showComposition, setShowComposition] = useState(false);

  const color =
    verdict === "High risk"
      ? "bg-red-600"
      : verdict === "Moderate risk"
        ? "bg-yellow-500"
        : "bg-green-600";

  // ✅ Filter out any accidental duplicate "Base model risk"
  const filteredLog = scoreLog.filter(
    (item) => !/base model/i.test(item.label)
  );

  const totalScore = baseScore + filteredLog.reduce((a, b) => a + b.value, 0);

  return (
    <div className="p-6 border rounded-lg bg-white dark:bg-gray-800 shadow">
      {/* 🟩 Verdict Banner */}
      <div className={`text-white text-lg font-semibold px-4 py-2 rounded ${color}`}>
        {verdict}
      </div>

      {/* 📊 Score Gauge */}
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

      {/* 🔍 Score Composition */}
      <div className="mt-3">
        <button
          onClick={() => setShowComposition((s) => !s)}
          className="text-xs text-blue-500 hover:underline"
        >
          {showComposition ? "▾ Hide score composition" : "▸ Show score composition"}
        </button>

        {showComposition && (
          <div className="mt-2 text-xs rounded-lg p-3 bg-gray-100 dark:bg-gray-900 border border-gray-700">
            <p className="italic text-gray-500 mb-2">
              <span className="text-red-400">Red</span> = adds risk,{" "}
              <span className="text-green-400">Green</span> = reduces risk.
            </p>

            <table className="w-full text-gray-200 text-[13px]">
              <tbody>
                {/* ✅ Base model row */}
                <tr>
                  <td className="text-gray-400 flex items-center">
                    Base model risk
                    <ScoreExplanation text="Initial risk assessment based on volume spikes, price action, and SEC filings." />
                  </td>
                  <td className="text-right text-blue-400 font-semibold">
                    +{baseScore}
                  </td>
                </tr>

                {/* ✅ Score modifiers */}
                {filteredLog.map((item, i) => (
                  <tr key={i}>
                    <td
                      className={`${item.value > 0
                          ? "text-red-400"
                          : item.value < 0
                            ? "text-green-400"
                            : "text-gray-400"
                        } flex items-center`}
                    >
                      {item.label}
                      {item.explanation && <ScoreExplanation text={item.explanation} />}
                    </td>
                    <td
                      className={`text-right font-semibold ${item.value > 0
                          ? "text-red-400"
                          : item.value < 0
                            ? "text-green-400"
                            : "text-gray-400"
                        }`}
                    >
                      {item.value > 0 ? `+${item.value}` : item.value}
                    </td>
                  </tr>
                ))}

                {/* ✅ Final score total */}
                <tr>
                  <td className="text-gray-300 pt-1 border-t border-gray-700 font-semibold">
                    Final adjusted score
                  </td>
                  <td className="text-right pt-1 border-t border-gray-700 text-blue-400 font-bold">
                    {totalScore}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="text-[11px] text-gray-500 mt-2 italic">
              Baseline model risk plus individual modifiers equals final adjusted score.
            </p>
          </div>
        )}
      </div>

      {/* 🧾 Summary */}
      <p className="mt-4 text-gray-800 dark:text-gray-200 text-sm">{summary}</p>

      {/* 💧 Droppiness Verdict */}
      <p className="mt-2 text-gray-600 dark:text-gray-400 text-sm italic">
        {droppinessVerdict}
      </p>

      {/* ⚡ Key Risk Drivers */}
      {drivers.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-1">Key Risk Drivers</h3>
          <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300">
            {drivers.map((d, i) => (
              <li key={i}>
                {d.label}{" "}
                <span className="text-red-500 font-medium">
                  ({d.value > 0 ? "+" : ""}
                  {d.value})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-gray-500 italic mt-2">
          No major red flags detected.
        </p>
      )}

      {/* 🏁 Manual Flags */}
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
