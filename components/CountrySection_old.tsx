"use client";

import React from "react";

const COUNTRY_FLAGS: Record<string, string> = {
  "United States": "🇺🇸",
  China: "🇨🇳",
  "Hong Kong": "🇭🇰",
  Singapore: "🇸🇬",
  Canada: "🇨🇦",
  Israel: "🇮🇱",
  India: "🇮🇳",
  "United Kingdom": "🇬🇧",
};

const RISKY_COUNTRIES = ["China", "Hong Kong", "Malaysia", "Singapore"];

interface Props {
  ticker?: string;
  country: string;
  countrySource?: string;
  showCard?: boolean;
}

export default function CountrySection({
  ticker,
  country,
  countrySource,
  showCard = true,
}: Props) {
  const emoji = COUNTRY_FLAGS[country] || "🌐";
  const isRisky = RISKY_COUNTRIES.includes(country);

  const content = (
    <div className="flex items-center gap-3">
      <span className="text-xl">{emoji}</span>
      <span
        className={`text-sm font-medium ${
          isRisky
            ? "text-red-600 dark:text-red-400"
            : "text-gray-800 dark:text-gray-200"
        }`}
      >
        {country || "Unknown"}
        {isRisky && (
          <span className="ml-2 px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded text-xs">
            Risky
          </span>
        )}
      </span>
      {countrySource && (
        <span className="text-xs text-gray-500 dark:text-gray-400 italic ml-2">
          (Source: {countrySource})
        </span>
      )}
    </div>
  );

  return showCard ? (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-sm transition-colors">
      <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
        📍 {ticker || ""} Country
      </h2>
      {content}
    </div>
  ) : (
    content
  );
}
