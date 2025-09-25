"use client";

export default function DroppinessCard({
  score,
  detail,
  verdict,
}: {
  score: number;
  detail: Array<{ date: string; spikePct: number; retraced: boolean }>;
  verdict: string;
}) {
  // sort descending by date
  const sorted = [...detail].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-3">📉 Droppiness</h2>

      <p className="mb-2">
        <span className="font-semibold">Score:</span> {score}% over the last 24
        months
      </p>

      <p className="mb-2">{verdict}</p>

      {sorted.length > 0 && (
        <ul className="text-sm text-gray-700 space-y-1">
          {sorted.slice(0, 10).map((d, idx) => {
            const justDate = d.date.includes("T")
              ? d.date.split("T")[0]
              : d.date;
            return (
              <li key={idx}>
                {justDate}: spike of {d.spikePct}%{" "}
                {d.retraced ? "→ retraced" : "→ held"}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
