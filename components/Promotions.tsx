"use client";

import CardTitle from "./CardTitle";

type Promotion = {
  date: string;
  type: string;
  url: string;
};

function formatDate(iso: string): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  if (!Number.isFinite(d.valueOf())) return iso; // fallback to raw if invalid
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Promotions({
  ticker,
  promotions,
}: {
  ticker: string;
  promotions?: Promotion[];
}) {
  const items = Array.isArray(promotions) ? promotions : [];

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-sm">
      <CardTitle icon="📢" ticker={ticker} label="Promotions" />

      {items.length === 0 ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>No promotions found for this ticker</strong>. Please also
          manually check{" "}
          <a
            href="https://seekingalpha.com/market-news/promotions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 underline"
          >
            promotions feeds
          </a>.
        </p>
      ) : (
        <ul className="space-y-2 mt-2 text-sm text-gray-700 dark:text-gray-300">
          {items.map((p, i) => (
            <li key={i}>
              <span className="font-medium">{formatDate(p.date)}</span>:{" "}
              {p.type}{" "}
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
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
