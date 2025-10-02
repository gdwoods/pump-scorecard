"use client";

type Promotion = { type: string; date: string; url: string };

export default function Promotions({
  ticker,
  promotions,
}: {
  ticker: string;
  promotions: Promotion[];
}) {
  const items = Array.isArray(promotions) ? promotions : [];

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-3">📢 {ticker} Promotions</h2>

      {items.length === 0 || (items.length === 1 && items[0].type === "Manual Check") ? (
        <p className="text-sm text-gray-700">
          No promotions detected — please also check{" "}
          <a
            href="https://www.stockpromotiontracker.com/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            Stock Promotion Tracker
          </a>
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((p, i) => (
            <li key={i} className="border rounded p-2 bg-gray-50">
              <span className="font-medium">{p.type}</span>{" "}
              {p.date && <span className="text-gray-500">({p.date})</span>}{" "}
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline ml-1"
              >
                link
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
