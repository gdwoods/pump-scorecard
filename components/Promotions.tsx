// components/Promotions.tsx
"use client";

import React from "react";

type Promotion = {
  type: string;
  date: string;
  url: string;
};

interface Props {
  promotions: Promotion[];
}

export default function Promotions({ promotions }: Props) {
  if (!promotions || promotions.length === 0) return null;

  // If only Manual Check fallback
  if (promotions.length === 1 && promotions[0].type === "Manual Check") {
    return (
      <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow">
        <h2 className="text-lg font-semibold mb-2">📢 Promotions</h2>
        <p className="text-gray-600 dark:text-gray-300">
          No promotions were found for this ticker —
          <a
            href={promotions[0].url || "https://www.stockpromotiontracker.com/"}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 text-blue-600 hover:underline"
          >
            Manual Check
          </a>
        </p>
      </div>
    );
  }

  // Otherwise, render list
  return (
    <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow">
      <h2 className="text-lg font-semibold mb-2">📢 Promotions</h2>
      <ul className="list-disc list-inside text-gray-700 dark:text-gray-300">
        {promotions.map((p, idx) => (
          <li key={idx}>
            {p.date} — {p.type}{" "}
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline ml-1"
            >
              View
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
