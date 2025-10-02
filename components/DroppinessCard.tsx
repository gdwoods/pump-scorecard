"use client";

export default function DroppinessCard({
  ticker,
  score,
  detail,
  verdict,
}: {
  ticker: string;
  score: number;
  detail: Array<{ date: string; spikePct: number; retraced: boolean }>;
  verdict: string;
}) {
  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-3">📉 {ticker} Droppiness</h2>

      <p className="mb-2">
        <span className="font-semibold">Score:</span> {score}% over the last 24 months
      </p>

      <p className="mb-2">{verdict}</p>

      {detail && detail.length > 0 && (
        <ul className="text-sm text-gray-700 space-y-1">
          {detail
            .slice(-15) // ⬅️ show only the last 15 spikes
            .reverse() // newest at the top
            .map((d, idx) => (
              <li key={idx}>
                {new Date(d.date).toLocaleDateString()}: spike of {d.spikePct}%{" "}
                {d.retraced ? "→ retraced" : "→ held"}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
