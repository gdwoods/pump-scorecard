"use client";

import { useState, useEffect } from "react";
import { countryInfo } from "@/utils/countryToFlag";
import { formatNumber } from "@/utils/formatNumber";

type Props = { result: any };

export default function Fundamentals({ result }: Props) {
  if (!result) return null;
  console.log("🧠 Fundamentals received:", {
    ticker: result?.ticker,
    hasOptions: result?.hasOptions,
    rawResult: result,
  });

  const { flag, isRisky } = countryInfo(result.country);
  const [expanded, setExpanded] = useState(false);
  const [hasOptions, setHasOptions] = useState<boolean | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // ✅ Corrected options check using Polygon’s `underlying_ticker`
  useEffect(() => {
    async function checkOptionsAvailability() {
      if (!result?.ticker) return;
      setLoadingOptions(true);
      try {
        const response = await fetch(
          `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${result.ticker}&limit=1&apiKey=${process.env.NEXT_PUBLIC_POLYGON_KEY}`
        );
        const data = await response.json();
setHasOptions(!(data.results && data.results.length > 0) ? false : true);
      } catch (err) {
        console.error("Error checking options availability:", err);
        setHasOptions(null);
      } finally {
        setLoadingOptions(false);
      }
    }

    checkOptionsAvailability();
  }, [result?.ticker]);

  return (
    <div className="p-6 border rounded-lg bg-white dark:bg-gray-800 shadow">
      <h2 className="text-lg font-semibold mb-4">
        📊 Fundamentals{result?.ticker ? ` — ${result.ticker}` : ""}
      </h2>

      <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        {/* ✅ Country */}
        <li
          className={
            isRisky ? "text-red-500 font-semibold col-span-2" : "col-span-2"
          }
        >
          <strong>Country:</strong> {flag} {result.country ?? "Unknown"}
        </li>

        <li>
          <strong>Shares Outstanding:</strong>{" "}
          {formatNumber(result.sharesOutstanding)}
        </li>
        <li>
          <strong>Market Cap:</strong> {formatNumber(result.marketCap, true)}
        </li>
        <li>
          <strong>Average Volume:</strong> {formatNumber(result.avgVolume)}
        </li>
        <li>
          <strong>Float:</strong> {formatNumber(result.floatShares)}
        </li>
        <li>
          <strong>Short Float:</strong>{" "}
          {result.shortFloat != null
            ? `${result.shortFloat.toFixed(1)}%`
            : "N/A"}
        </li>
        <li>
          <strong>Latest Volume:</strong> {formatNumber(result.latestVolume)}
        </li>
        <li>
          <strong>Institutional Ownership:</strong>{" "}
          {result.institutionalOwnership != null
            ? `${result.institutionalOwnership.toFixed(1)}%`
            : "N/A"}
        </li>
        <li>
          <strong>Insider Ownership:</strong>{" "}
          {result.insiderOwnership != null
            ? `${result.insiderOwnership.toFixed(1)}%`
            : "N/A"}
        </li>
        <li>
          <strong>Exchange:</strong> {result.exchange ?? "N/A"}
        </li>

        {/* ✅ Price and 52W range */}
        <li>
          <strong>Last Price:</strong>{" "}
          {result.lastPrice != null
            ? `$${result.lastPrice.toFixed(2)}`
            : "N/A"}
        </li>
        <li>
          <strong>52-Week High:</strong>{" "}
          {result.high52Week != null
            ? `$${result.high52Week.toFixed(2)}`
            : "N/A"}
        </li>
        <li>
          <strong>52-Week Low:</strong>{" "}
          {result.low52Week != null
            ? `$${result.low52Week.toFixed(2)}`
            : "N/A"}
        </li>

        {/* ✅ Options Availability */}
<li className="col-span-2">
  <strong>Options Available:</strong>{" "}
  {result.hasOptions ? (
    <span className="text-red-500 font-semibold">
      ❌ Yes (avoid)
    </span>
  ) : (
    <span className="text-green-500 font-semibold">
      ✅ No (clean)
    </span>
  )}
</li>


        {/* ✅ Splits */}
        {result.splits && result.splits.length > 0 && (
          <li className="col-span-2">
            <strong>Recent Splits:</strong>
            <ul className="ml-4 list-disc text-sm">
              {result.splits.map((s: any, i: number) => (
                <li key={i}>
                  {s.ratio} on{" "}
                  {new Date(s.date).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </li>
              ))}
            </ul>
          </li>
        )}
        

        {/* ✅ Company Profile */}
        {result.companyProfile && (
          <>
            <li className="col-span-2">
              <strong>Sector:</strong>{" "}
              {result.companyProfile.sector ?? "N/A"}
            </li>
            <li className="col-span-2">
              <strong>Industry:</strong>{" "}
              {result.companyProfile.industry ?? "N/A"}
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
