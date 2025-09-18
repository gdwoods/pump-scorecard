"use client";

import { useState } from "react";

type Filing = {
  title?: string;
  date?: string;
  url?: string;
};

type Props = {
  filings?: Filing[];
};

export default function SecFilings({ filings = [] }: Props) {
  const [filter, setFilter] = useState<"all" | "dilution">("all");

  const isDilution = (title?: string) =>
    title
      ? ["S-1", "424B", "F-1", "F-3", "F-4", "S-3"].some((f) =>
          title.toUpperCase().includes(f)
        )
      : false;

  // Always work with an array, never undefined
  const displayFilings = (filings || []).filter((f) =>
    filter === "dilution" ? isDilution(f.title) : true
  );

  return (
    <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold">📄 SEC Filings</h2>
        <div className="space-x-2">
          <button
            onClick={() => setFilter("dilution")}
            className={`px-3 py-1 rounded ${
              filter === "dilution"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700"
            }`}
          >
            Dilution-Only
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded ${
              filter === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700"
            }`}
          >
            All Filings
          </button>
        </div>
      </div>

      {displayFilings.length === 0 ? (
        <p className="text-gray-500 italic">No filings found.</p>
      ) : (
        <ul className="space-y-2">
          {displayFilings.slice(0, 10).map((filing, idx) => (
            <li key={idx} className="flex justify-between">
              <span>
                {filing.date || "Unknown"} — {filing.title || "Unknown"}
              </span>
              {filing.url && (
                <a
                  href={filing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  View
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {filings.length > 10 && (
        <p className="text-gray-500 text-sm italic mt-2">
          Showing 10 of {filings.length} filings…
        </p>
      )}
    </div>
  );
}
