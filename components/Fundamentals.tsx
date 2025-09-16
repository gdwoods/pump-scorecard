"use client";

import { Card, CardContent } from "@/components/ui/Card";

export default function Fundamentals({ result }: { result: any }) {
  return (
    <Card>
      <CardContent>
        <h3 className="text-lg font-bold">📈 Fundamentals</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>Market Cap: ${result.marketCap?.toLocaleString()}</li>
          <li>Shares Outstanding: {result.sharesOutstanding?.toLocaleString()}</li>
          <li>Float Shares: {result.floatShares?.toLocaleString()}</li>
          <li>
            Short Float: {result.shortFloat ? (result.shortFloat * 100).toFixed(1) + "%" : "N/A"}
          </li>
          <li>
            Insider Ownership: {result.insiderOwn ? (result.insiderOwn * 100).toFixed(1) + "%" : "N/A"}
          </li>
          <li>
            Institutional Ownership: {result.instOwn ? (result.instOwn * 100).toFixed(1) + "%" : "N/A"}
          </li>
          <li>Exchange: {result.exchange}</li>
          <li>
            Country:{" "}
            <span
              className={
                result.riskyCountry
                  ? "text-red-600 font-semibold"
                  : result.country === "Unknown"
                  ? "text-yellow-600 font-semibold"
                  : "text-green-700 font-semibold"
              }
            >
              {result.country}
            </span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
