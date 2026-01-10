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
  const hasOlder = Array.isArray(olderPromotions) && olderPromotions.length > 0;
  
  // Check if we have real promotions (not just manual check fallbacks)
  const hasRealOlder = hasOlder && olderPromotions.some(p => p.type !== "Manual Check" && p.source !== "Manual Check");
  const hasRealPromotions = hasRealOlder;

  return (
    <Card className="p-4 bg-white dark:bg-slate-800 shadow-sm rounded-xl">
      <CardContent>
        <h2 className="text-lg font-semibold mb-3">📢 {ticker.toUpperCase()} Promotions</h2>

        {/* Paywall Notice */}
        {!hasRealPromotions && (
          <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
            <p className="text-sm text-orange-800 dark:text-orange-300 font-semibold mb-2">
              🔒 API Access Limited
            </p>
            <p className="text-sm text-orange-700 dark:text-orange-400 mb-2">
              Stock Promotion Tracker is now behind a paywall. Promotional data cannot be automatically retrieved.
            </p>
            <p className="text-sm text-orange-700 dark:text-orange-400">
              Visit{" "}
              <a
                href="https://www.stockpromotiontracker.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline font-semibold hover:text-blue-800 dark:hover:text-blue-300"
              >
                stockpromotiontracker.com
              </a>{" "}
              to check for promotions manually.
            </p>
          </div>
        )}

        {/* ✅ OLDER PROMOTIONS */}
        <div>
          <h3 className="font-medium text-gray-400 mb-2 flex items-center gap-1">
            🕰 Older Mentions
          </h3>

          {hasRealOlder ? (
            <ul className="space-y-2 text-sm">
              {olderPromotions
                .filter(p => p.type !== "Manual Check" && p.source !== "Manual Check")
                .map((p, i) => (
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
                    {p.source || p.type || "Promotion source"}
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
                href="https://www.stockpromotiontracker.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 underline font-semibold"
              >
                Stock Promotion Tracker
              </a>
              ,{" "}
              <a
                href={`https://stocktwits.com/symbol/${ticker.toUpperCase()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 underline"
              >
                Stocktwits
              </a>
              , or{" "}
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
