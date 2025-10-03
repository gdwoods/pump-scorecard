"use client";

import { useState } from "react";
import { countryInfo } from "@/utils/countryToFlag";
import { formatNumber } from "@/utils/formatNumber";

type Props = { result: any };

export default function Fundamentals({ result }: Props) {
  if (!result) return null;

  const { flag, isRisky } = countryInfo(result.country);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="p-6 border rounded-lg bg-white dark:bg-gray-800 shadow">
      <h2 className="text-lg font-semibold mb-4">📊 Fundamentals</h2>

      <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <li>
          <strong>Last Price:</strong>{" "}
          {result.lastPrice != null ? `$${result.lastPrice.toFixed(2)}` : "N/A"}
        </li>
        <li>
          <strong>Market Cap:</strong>{" "}
          {formatNumber(result.marketCap, true)}
        </li>
        <li>
          <strong>Shares Outstanding:</strong>{" "}
          {formatNumber(result.sharesOutstanding)}
        </li>
        <li>
          <strong>Float:</strong>{" "}
          {formatNumber(result.floatShares)}
        </li>
        <li>
          <strong>Average Volume:</strong>{" "}
          {formatNumber(result.avgVolume)}
        </li>
        <li>
          <strong>Latest Volume:</strong>{" "}
          {formatNumber(result.latestVolume)}
        </li>
        <li>
          <strong>Short Float:</strong>{" "}
          {result.shortFloat != null ? `${result.shortFloat.toFixed(1)}%` : "N/A"}
        </li>
        <li>
          <strong>Insider Ownership:</strong>{" "}
          {result.insiderOwnership != null
            ? `${result.insiderOwnership.toFixed(1)}%`
            : "N/A"}
        </li>
        <li>
          <strong>Institutional Ownership:</strong>{" "}
          {result.institutionalOwnership != null
            ? `${result.institutionalOwnership.toFixed(1)}%`
            : "N/A"}
        </li>
        <li>
          <strong>Exchange:</strong> {result.exchange ?? "N/A"}
        </li>
        <li className={isRisky ? "text-red-500 font-semibold" : ""}>
          <strong>Country:</strong> {flag} {result.country ?? "Unknown"}
        </li>

{/* ✅ Company Profile Section */}
{result.companyProfile && (
  <>
    {/* Divider */}
    <li className="col-span-2">
      <hr className="my-2 border-gray-300 dark:border-gray-700" />
    </li>

    <li className="col-span-2">
      <strong>Sector:</strong> {result.companyProfile.sector ?? "N/A"}
    </li>
    <li className="col-span-2">
      <strong>Industry:</strong> {result.companyProfile.industry ?? "N/A"}
    </li>
    <li className="col-span-2">
      <strong>Employees:</strong>{" "}
      {result.companyProfile.employees
        ? result.companyProfile.employees.toLocaleString()
        : "N/A"}
    </li>
    <li className="col-span-2">
      <strong>Website:</strong>{" "}
      {result.companyProfile.website ? (
        <a
          href={result.companyProfile.website}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
          {result.companyProfile.website}
        </a>
      ) : (
        "N/A"
      )}
    </li>
    {result.companyProfile.summary && (
      <li className="col-span-2 text-gray-700 dark:text-gray-300 text-sm">
        <div className={expanded ? "" : "line-clamp-3"}>
          {result.companyProfile.summary}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-blue-600 text-xs mt-1"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      </li>
    )}
  </>
)}

      </ul>
    </div>
  );
}
