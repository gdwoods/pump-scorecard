"use client";

type Promotion = {
  type: string;
  date: string;
  url: string;
};

export default function Promotions({
  ticker,
  promotions,
}: {
  ticker: string;
  promotions: Promotion[];
}) {
  const items = promotions || [];

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-sm transition-colors">
      <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
        📢 {ticker} Promotions
      </h2>

      {items.length === 0 ||
      (items.length === 1 && items[0].type === "Manual Check") ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          No promotions found — please manually check{" "}
          <a
            href="https://www.stockpromotiontracker.com/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 dark:text-blue-400 underline"
          >
            stockpromotiontracker.com
          </a>
        </p>
      ) : (
        <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          {items.map((p, i) => (
            <li key={i}>
              {p.date}: {p.type}{" "}
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
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
