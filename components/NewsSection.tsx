"use client";
import CardTitle from "./CardTitle";

export type NewsItem = {
  title: string;
  url: string;
  publisher?: string;
  published?: string | number | null;
};

// Format the published date (absolute + relative)
function formatPublished(published: NewsItem["published"]) {
  if (published == null) return "";

  const d = new Date(Number(published));
  if (!Number.isFinite(d.valueOf())) return "";

  // Absolute date
  const dateStr = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Relative
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  let relative = "";
  if (days === 0) relative = "today";
  else if (days === 1) relative = "yesterday";
  else if (days < 30) relative = `${days}d ago`;
  else if (days < 365) relative = `${Math.floor(days / 30)}mo ago`;
  else relative = `${Math.floor(days / 365)}y ago`;

  return `${dateStr} (${relative})`;
}

export default function NewsSection({
  ticker,
  items,
}: {
  ticker: string;
  items?: NewsItem[] | null;
}) {
  const news = Array.isArray(items) ? items : [];

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow">
      <CardTitle icon="📰" ticker={ticker} label="Recent News" />

      {news.length === 0 ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>No recent news found for this ticker</strong>. Please also check{" "}
          <a
            href="https://news.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 underline"
          >
            Google News
          </a>{" "}
          or{" "}
          <a
            href="https://x.com/search?q="
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 underline"
          >
            X (Twitter)
          </a>.
        </p>
      ) : (
        <ul className="space-y-3 mt-2">
          {news.map((n, i) => {
            const dateStr = formatPublished(n.published);
            return (
              <li
                key={i}
                className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition"
              >
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-700 dark:text-blue-400 underline"
                >
                  {n.title}
                </a>
                <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                  {n.publisher ? <span>{n.publisher}</span> : null}
                  {dateStr && (
                    <span>
                      {n.publisher ? " – " : ""}
                      {dateStr}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
