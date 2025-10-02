"use client";
import { useState } from "react";
import CardTitle from "./CardTitle";

type Filing = {
  formType: string;
  date: string;
  url: string;
  dilutionRisk?: boolean;
};

export default function SecFilings({
  ticker,
  filings,
}: {
  ticker: string;
  filings?: Filing[];
}) {
  const [filter, setFilter] = useState<"all" | "dilution">("all");
  const items = Array.isArray(filings) ? filings : [];

  const filtered =
    filter === "all" ? items : items.filter((f) => f.dilutionRisk === true);

  return (
    <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow">
      <div className="flex justify-between items-center mb-2">
        <CardTitle icon="📄" ticker={ticker} label="SEC Filings" />
        <div className="space-x-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-2 py-1 text-xs rounded ${
              filter === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("dilution")}
            className={`px-2 py-1 text-xs rounded ${
              filter === "dilution"
                ? "bg-red-600 text-white"
                : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
            }`}
          >
            Dilution Only
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          No SEC filings found for this ticker.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {filtered.map((f, i) => (
            <li key={i} className="flex justify-between items-center border-b pb-1">
              <div>
                <span className="font-medium">{f.formType}</span> – {f.date}
              </div>
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                View
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
