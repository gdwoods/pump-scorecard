"use client";
import { useState } from "react";
import CollapsibleCard from "./CollapsibleCard";

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
    <CollapsibleCard title={`📄 ${ticker} SEC Filings`} defaultOpen={true}>
      {/* Removed CardTitle here */}

      <div className="flex justify-between items-center mb-2">
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
          No SEC filings found — please manually check{" "}
          <a
            href="https://www.sec.gov/edgar/searchedgar/companysearch.html"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 dark:text-blue-400 underline"
          >
            EDGAR
          </a>
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {filtered.map((f, i) => (
            <li
              key={i}
              className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-1"
            >
              <div>
                <span className="font-medium">{f.formType}</span> – {f.date}
              </div>
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                View
              </a>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}
