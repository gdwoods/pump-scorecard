"use client";
import { useState } from "react";

type Filing = {
  title: string;
  date: string;
  url: string;
  businessAddress?: any;
  mailingAddress?: any;
};

export default function SecFilings({
  ticker,
  filings,
}: {
  ticker: string;
  filings: Filing[];
}) {
  const [filter, setFilter] = useState<"all" | "dilution">("all");
  const items = Array.isArray(filings) ? filings : [];

  const filtered =
    filter === "all"
      ? items
      : items.filter((f) => f.title.includes("S-1") || f.title.includes("424B"));

  return (
    <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold">📄 {ticker} SEC Filings</h2>
        <div className="space-x-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-2 py-1 text-xs rounded ${
              filter === "all" ? "bg-blue-600 text-white" : "bg-gray-200"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("dilution")}
            className={`px-2 py-1 text-xs rounded ${
              filter === "dilution" ? "bg-blue-600 text-white" : "bg-gray-200"
            }`}
          >
            Dilution
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-700">
          No filings found for this ticker. Check{" "}
          <a
            href="https://www.sec.gov/edgar/search/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            SEC EDGAR
          </a>
          .
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {filtered.map((f, i) => (
            <li key={i} className="border rounded p-2 bg-gray-50">
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-600 underline"
              >
                {f.title}
              </a>{" "}
              <span className="text-gray-500">({f.date})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
