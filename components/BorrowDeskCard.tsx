"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  ComposedChart,
  Bar,
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
  };
}) {
  const chartData =
    borrowData.daily?.map((d) => ({
      date: d.date,
      fee: Number(d.fee),
      available: Number(d.available),
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

            {/* Combo chart */}
            {chartData.length > 0 && (
              <div className="h-64 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    {/* X-axis (dates) */}
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      minTickGap={20}
                    />

                    {/* Left Y-axis (Available shares) */}
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      tick={{ fontSize: 10 }}
                      domain={["auto", "auto"]}
                    />

                    {/* Right Y-axis (Fee %) */}
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 10 }}
                      domain={[0, "auto"]}
                      tickFormatter={(v) => `${v}%`}
                    />

                    <Tooltip />

                    {/* Bars = Available shares */}
                    <Bar
                      yAxisId="left"
                      dataKey="available"
                      fill="#60a5fa"
                      barSize={20}
                      opacity={0.7}
                    />

                    {/* Line = Fee % */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="fee"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
