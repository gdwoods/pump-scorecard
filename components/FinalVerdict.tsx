"use client";

import React from "react";

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
  let bgClass = "bg-gray-100 text-gray-800"; // default muted gray

  if (verdict === "High risk") {
    bgClass = "bg-red-100 text-red-800";
  } else if (verdict === "Moderate risk") {
    bgClass = "bg-yellow-100 text-yellow-800";
  } else if (verdict === "Low risk") {
    bgClass = "bg-green-100 text-green-800";
  }

  return (
    <div className={`rounded-2xl p-4 shadow ${bgClass}`}>
      <h2 className="text-xl font-bold">Final Verdict: {verdict}</h2>
      <p className="mt-2">{summary}</p>
      <p className="mt-2 font-semibold">Weighted Score: {score}</p>

      {droppinessVerdict && (
        <p className="mt-2 italic">Droppiness: {droppinessVerdict}</p>
      )}

      {Object.keys(manualFlags).length > 0 && (
        <div className="mt-2">
          <p className="font-semibold">Manual Flags:</p>
          <ul className="list-disc list-inside text-sm">
            {Object.entries(manualFlags)
              .filter(([_, v]) => v)
              .map(([k]) => (
                <li key={k}>{k}</li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
