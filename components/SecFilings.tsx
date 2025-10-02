"use client";
import { useState } from "react";
import CardTitle from "./CardTitle";

const FORM_REGEX =
  /(10-K\/A|10-Q\/A|8-K\/A|S-\d+\/A|F-\d+\/A|20-F\/A|13D\/A|13G\/A|10-K|10-Q|8-K|20-F|6-K|S-\d+|F-\d+|13D|13G|DRS\/A|DRS|424B\d*|EFFECT|25-NSE|CORRESP)/i;

const DILUTION_FORMS = ["S-1", "S-3", "F-1", "F-3", "424B", "EFFECT"];

function getFormLabel(filing: any) {
  // Use `title` field first
  const sources = [filing.title, filing.formType, filing.form, filing.filename, filing.url];
  for (const src of sources) {
    if (!src) continue;
    const match = src.match(FORM_REGEX);
    if (match) return match[0].toUpperCase();
  }
  return "Unknown";
}

function isDilutionForm(filing: any) {
  const label = getFormLabel(filing);
  return DILUTION_FORMS.some((d) => label.startsWith(d));
}

export default function SecFilings({
  ticker,
  filings,
}: {
  ticker: string;
  filings?: Array<{
    title?: string;
    formType?: string;
    form?: string;
    date: string;
    url: string;
    filename?: string;
  }>;
}) {
  const [filter, setFilter] = useState<"all" | "dilution">("all");
  const items = Array.isArray(filings) ? filings : [];

  const dilutionItems = items.filter((f) => isDilutionForm(f));
  const filtered = filter === "all" ? items : dilutionItems;

  // Group by year
  const grouped: Record<string, typeof filtered> = {};
  filtered.forEach((f) => {
    const year = f.date?.slice(0, 4) || "Unknown";
    if (!grouped[year]) grouped[year] = [];
    grouped[year].push(f);
  });

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow">
      <div className="flex justify-between items-center mb-2">
        <CardTitle icon="📄" ticker={ticker} label="SEC Filings" />
        <div className="flex space-x-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 text-xs rounded ${
              filter === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("dilution")}
            className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${
              filter === "dilution"
                ? "bg-red-600 text-white"
                : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
            }`}
          >
            Dilution Only
            {dilutionItems.length > 0 && (
              <span className="ml-1 bg-white text-red-600 rounded-full px-2 py-0.5 text-xs">
                {dilutionItems.length}
              </span>
            )}
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
            className="text-blue-600 underline"
          >
            EDGAR
          </a>
        </p>
      ) : (
        <div className="space-y-4">
          {Object.keys(grouped)
            .sort((a, b) => b.localeCompare(a))
            .map((year) => (
              <div key={year}>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  {year}
                </h3>
                <ul className="space-y-2 text-sm">
                  {grouped[year].map((f, i) => {
                    const label = getFormLabel(f);
                    const isDilution = isDilutionForm(f);
                    return (
                      <li
                        key={i}
                        className="flex justify-between items-center border-b pb-1"
                      >
                        <div>
                          <span
                            className={`font-medium ${
                              isDilution
                                ? "text-red-600 dark:text-red-400"
                                : ""
                            }`}
                          >
                            {label}
                          </span>{" "}
                          – {f.date}
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
                    );
                  })}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
