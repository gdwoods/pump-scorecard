"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";

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

const RISKY_COUNTRIES = ["China", "Hong Kong", "Malaysia"];

interface Props {
  country: string;
  countrySource?: string;
  showCard?: boolean;
}

export default function CountrySection({
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
          isRisky ? "text-red-600" : "text-gray-800"
        }`}
      >
        {country || "Unknown"}
        {isRisky && (
          <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
            Risky
          </span>
        )}
      </span>
      {countrySource && (
        <span className="text-xs text-gray-500 italic ml-2">
          (Source: {countrySource})
        </span>
      )}
    </div>
  );

  return showCard ? (
    <Card>
      <CardContent className="p-4">
        <div className="font-semibold mb-1">📍 Country</div>
        {content}
      </CardContent>
    </Card>
  ) : (
    content
  );
}
