"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function BorrowDeskCard({
  ticker,
  borrowData,
}: {
  ticker: string;
  borrowData: {
    fee: string;
    available: string;
    updated: string;
    source: string;
    daily?: Array<{ date: string; fee: number; available: number }>;
    realTime?: Array<{ datetime: string; fee: number; available: number }>;
  };
}) {
  const [chartMode, setChartMode] = useState<"fee" | "available">("fee");

  // pick daily history, fallback to realtime if no daily
  const chartData =
    borrowData.daily?.map((d) => ({
      date: d.date,
      fee: Number(d.fee),
      available: d.available,
    })) || [];

  return (
    <Card className="p-4">
      <CardContent>
        <h2 className="text-lg font-semibold mb-2">💸 {ticker} iBorrowDesk</h2>

        {borrowData.fee === "Manual Check" ? (
          <p>
            Data unavailable — please manually check{" "}
            <a
              href={borrowData.source}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              iBorrowDesk
            </a>
          </p>
        ) : (
          <>
            <p>
              <strong>Fee:</strong> {borrowData.fee}%
            </p>
            <p>
              <strong>Available:</strong> {borrowData.available}
            </p>
            <p>
              <strong>Updated:</strong> {borrowData.updated}
            </p>
            <p>
              <a
                href={borrowData.source}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
              >
                View on iBorrowDesk
              </a>
            </p>

            {/* Toggle buttons */}
            {chartData.length > 0 && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setChartMode("fee")}
                  className={`px-2 py-1 text-xs rounded ${
                    chartMode === "fee"
                      ? "bg-red-600 text-white"
                      : "bg-gray-200 dark:bg-gray-600"
                  }`}
                >
                  Fee %
                </button>
                <button
                  onClick={() => setChartMode("available")}
                  className={`px-2 py-1 text-xs rounded ${
                    chartMode === "available"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-600"
                  }`}
                >
                  Available
                </button>
              </div>
            )}

            {/* Mini Chart */}
            {chartData.length > 0 && (
              <div className="h-40 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      minTickGap={20}
                    />
                    <YAxis
                      dataKey={chartMode}
                      tick={{ fontSize: 10 }}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey={chartMode}
                      stroke={chartMode === "fee" ? "#ef4444" : "#3b82f6"}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
