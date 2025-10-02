"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
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

  // Formatter for large numbers → 10k, 2M
  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
    return num.toString();
  };

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
              <div className="h-72 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      minTickGap={20}
                    />

                    {/* Available shares axis (left) */}
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      tick={{ fontSize: 10 }}
                      tickFormatter={formatNumber}
                      domain={["auto", "auto"]}
                    />

                    {/* Fee % axis (right) */}
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `${v}%`}
                      domain={[0, "auto"]}
                    />

                    <Tooltip
                      formatter={(val: any, name: string) =>
                        name === "Fee %"
                          ? `${val.toFixed(2)}%`
                          : formatNumber(val)
                      }
                    />

                    <Legend
                      verticalAlign="top"
                      wrapperStyle={{ fontSize: "12px" }}
                    />

                    {/* Bars = Available shares */}
                    <Bar
                      yAxisId="left"
                      dataKey="available"
                      name="Available"
                      fill="#60a5fa"
                      barSize={20}
                      opacity={0.7}
                    />

                    {/* Line = Fee % */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="fee"
                      name="Fee %"
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
