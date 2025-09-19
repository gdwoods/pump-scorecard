"use client";

import React from "react";

interface Detail {
  date: string;
  spikePct: number;
  retraced: boolean;
}

interface Props {
  score: number;
  detail: Detail[];
}

export default function DroppinessCard({ score, detail }: Props) {
  let verdict = "Mixed behavior";
  let bgClass = "bg-gray-100 text-gray-800"; // default muted gray

  if (score === 0 && detail.length === 0) {
    verdict = "No qualifying spikes in the last 24 months";
    bgClass = "bg-gray-100 text-gray-800";
  } else if (score >= 70) {
    verdict = "Spikes usually fade quickly";
    bgClass = "bg-green-100 text-green-800";
  } else if (score < 40) {
    verdict = "Spikes often hold";
    bgClass = "bg-red-100 text-red-800";
  } else {
    verdict = "Mixed behavior";
    bgClass = "bg-yellow-100 text-yellow-800";
  }

  const recent = detail.slice(-3).reverse();

  return (
    <div className={`rounded-2xl p-4 shadow ${bgClass}`}>
      <h2 className="text-lg font-semibold">📉 Droppiness</h2>
      <p className="mt-2 font-medium">
        Score: {score}% — {verdict}
      </p>

      {recent.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold">Recent Spikes:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {recent.map((d, idx) => (
              <li key={idx}>
                {d.date.slice(0, 10)} — {d.spikePct}% →{" "}
                {d.retraced ? "Faded ✅" : "Held ❌"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
