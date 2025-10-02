"use client";

export type NewsItem = {
  title: string;
  url: string;
  publisher?: string;
  published?: string | number | null;
};

function formatPublished(published: NewsItem["published"]) {
  if (published == null) return "";
  let ms: number | null = null;

  if (typeof published === "number") {
    ms = published > 1e12 ? published : published * 1000;
  } else if (/^\d+$/.test(published)) {
    const n = Number(published);
    ms = n > 1e12 ? n : n * 1000;
  } else {
    const parsed = Date.parse(published);
    if (!Number.isNaN(parsed)) ms = parsed;
  }

  if (ms == null) return "";
  const d = new Date(ms);
  return Number.isFinite(d.valueOf())
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";
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
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-3">📰 {ticker} Recent News</h2>

      {news.length === 0 ? (
        <p className="text-sm text-gray-700">
          <strong>No recent news found for this ticker</strong>. Please also check{" "}
          <a
            href="https://news.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            Google News
          </a>{" "}
          or{" "}
          <a
            href="https://x.com/search?q="
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            X (Twitter)
          </a>
          .
        </p>
      ) : (
        <ul className="space-y-3">
          {news.map((n, i) => {
            const dateStr = formatPublished(n.published);
            return (
              <li key={i} className="border rounded-lg p-2 bg-gray-50 flex flex-col">
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-700 underline"
                >
                  {n.title}
                </a>
                {(n.publisher || dateStr) && (
                  <div className="text-xs text-gray-500 mt-1">
                    {n.publisher ?? ""}
                    {dateStr ? (n.publisher ? ` – ${dateStr}` : dateStr) : ""}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
