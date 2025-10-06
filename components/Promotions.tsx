"use client";

import { Card, CardContent } from "@/components/ui/card";

export default function Promotions({
  ticker,
  recentPromotions = [],
  olderPromotions = [],
}: {
  ticker: string;
  recentPromotions?: any[];
  olderPromotions?: any[];
}) {
  const hasRecent = Array.isArray(recentPromotions) && recentPromotions.length > 0;
  const hasOlder = Array.isArray(olderPromotions) && olderPromotions.length > 0;

  return (
    <Card className="p-4 bg-white dark:bg-slate-800 shadow-sm rounded-xl">
      <CardContent>
        <h2 className="text-lg font-semibold mb-3">📢 {ticker.toUpperCase()} Promotions</h2>

        {/* ✅ RECENT PROMOTIONS */}
        <div className="mb-4">
          <h3 className="font-medium text-green-500 mb-2 flex items-center gap-1">
            🟢 Recent Promotions (Last 30 Days)
          </h3>

          {hasRecent ? (
            <ul className="space-y-2 text-sm">
              {recentPromotions.map((p, i) => (
                <li
                  key={`recent-${i}`}
                  className="border-l-2 border-green-500 pl-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                >
                  <a
                    href={p.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline font-medium"
                  >
                    {p.source || "Promotion source"}
                  </a>
                  {p.date && (
                    <span className="text-gray-500 text-xs ml-2">
                      {new Date(p.date).toLocaleDateString()}
                    </span>
                  )}
                  {p.snippet && (
                    <p className="text-gray-600 dark:text-gray-300 text-xs mt-1 italic">
                      {p.snippet}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 italic">
              No recent promotions found within the last 30 days.
            </p>
          )}
        </div>

        {/* ✅ OLDER PROMOTIONS */}
        <div>
          <h3 className="font-medium text-gray-400 mb-2 flex items-center gap-1">
            🕰 Older Mentions
          </h3>

          {hasOlder ? (
            <ul className="space-y-2 text-sm">
              {olderPromotions.map((p, i) => (
                <li
                  key={`older-${i}`}
                  className="border-l-2 border-gray-400 pl-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                >
                  <a
                    href={p.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline font-medium"
                  >
                    {p.source || "Promotion source"}
                  </a>
                  {p.date && (
                    <span className="text-gray-500 text-xs ml-2">
                      {new Date(p.date).toLocaleDateString()}
                    </span>
                  )}
                  {p.snippet && (
                    <p className="text-gray-600 dark:text-gray-300 text-xs mt-1 italic">
                      {p.snippet}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 italic">
              No older promotions found — if you suspect activity, manually check{" "}
              <a
                href={`https://stocktwits.com/symbol/${ticker.toUpperCase()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 underline"
              >
                Stocktwits
              </a>{" "}
              or{" "}
              <a
                href={`https://twitter.com/search?q=${ticker.toUpperCase()}&src=typed_query`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 underline"
              >
                X (Twitter)
              </a>
              .
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
