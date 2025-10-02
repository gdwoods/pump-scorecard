"use client";
import CardTitle from "./CardTitle";

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
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow">
      <CardTitle icon="📉" ticker={ticker} label="Droppiness" />

      <p className="mb-2">
        <span className="font-semibold">Score:</span> {score}% over the last 24 months
      </p>

      <p className="mb-2">{verdict}</p>

      {detail && detail.length > 0 && (
        <ul className="text-sm text-gray-700 dark:text-gray-200 space-y-1">
          {detail
            .slice(-5)
            .reverse()
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
