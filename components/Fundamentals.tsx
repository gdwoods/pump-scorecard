"use client";

import { Card, CardContent } from "@/components/ui/Card";

export default function Fundamentals({ result }: { result: any }) {
  return (
    <Card>
      <CardContent>
        <h2 className="text-gray-900 dark:text-gray-100 font-semibold text-lg sm:text-xl mb-3">
          📊 Fundamentals
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-base sm:text-lg text-gray-800 dark:text-gray-200">
          <li>Last Price: ${result.last_price ?? "N/A"}</li>
          <li>Market Cap: {result.marketCap ?? "N/A"}</li>
          <li>Shares Outstanding: {result.sharesOutstanding ?? "N/A"}</li>
          <li>Float Shares: {result.floatShares ?? "N/A"}</li>
          <li>Avg Volume: {result.avg_volume ?? "N/A"}</li>
          <li>Latest Volume: {result.latest_volume ?? "N/A"}</li>
          <li>Short Float: {result.shortFloat ?? "N/A"}</li>
          <li>Insider Ownership: {result.insiderOwn ?? "N/A"}</li>
          <li>Institutional Ownership: {result.instOwn ?? "N/A"}</li>
          <li>Exchange: {result.exchange ?? "N/A"}</li>
          <li>Country: {result.country ?? "N/A"}</li>
        </ul>
      </CardContent>
    </Card>
  );
}
