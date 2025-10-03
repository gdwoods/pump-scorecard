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

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
    return num.toString();
  };

  // Risk classification based on fee
  const classifyRisk = (fee: number) => {
    if (fee < 50) return { label: "Low risk", color: "bg-green-100 text-green-800" };
    if (fee < 250) return { label: "Medium risk", color: "bg-yellow-100 text-yellow-800" };
    return { label: "Elevated risk", color: "bg-red-100 text-red-800" };
  };

  // Determine trend arrow from last 2 days
  let trend: "up" | "down" | "flat" | null = null;
  if (chartData.length >= 2) {
    const [latest, prev] = [chartData.at(-1)!, chartData.at(-2)!];
    if (latest.fee > prev.fee) trend = "up";
    else if (latest.fee < prev.fee) trend = "down";
    else trend = "flat";
  }

  const latestFee = Number(borrowData.fee);
  const risk = isNaN(latestFee) ? null : classifyRisk(latestFee);

  // Dynamic fee color logic
  const feeColor = (fee: number) => {
    if (fee < 50) return "#16a34a"; // green-600
    if (fee < 250) return "#f59e0b"; // amber-500
    return "#dc2626"; // red-600
  };

  return (
    <Card className="p-4 bg-white dark:bg-slate-800 shadow-sm rounded-xl">
      <CardContent className="space-y-2">
        <h2 className="text-lg font-semibold mb-2">
          💸 {ticker} iBorrowDesk
        </h2>

        {borrowData.fee === "Manual Check" ? (
          <p className="text-sm text-gray-700 dark:text-gray-300">
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
            <p className="flex items-center gap-2">
              <strong>Fee:</strong> {borrowData.fee}%
              {trend === "up" && <span className="text-red-600">⬆️</span>}
              {trend === "down" && <span className="text-green-600">⬇️</span>}
              {trend === "flat" && <span className="text-gray-400">➖</span>}
              {risk && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.color}`}
                >
                  {risk.label}
                </span>
              )}
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

            {chartData.length > 0 && (
              <div className="h-72 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "currentColor" }}
                      minTickGap={20}
                    />
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      tick={{ fontSize: 10, fill: "currentColor" }}
                      tickFormatter={formatNumber}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 10, fill: "currentColor" }}
                      tickFormatter={(v) => `${v}%`}
                    />
import { formatNumber } from "@/utils/formatNumber";

<Tooltip
  contentStyle={{
    backgroundColor: "#1f2937", // dark background
    borderColor: "#374151",     // subtle border
    color: "#f9fafb",           // default text
  }}
  labelStyle={{
    color: "#f9fafb",           // ✅ date is now readable in dark mode
    fontWeight: "500",
  }}
  formatter={(value: any, name: string) => {
    if (name === "Fee %") {
      return [`${Number(value).toFixed(2)}%`, "Fee"];
    }
    if (name === "Available") {
      return [formatNumber(value), "Available"]; // 🔥 uses M/B/K formatting
    }
    return [value, name];
  }}
  labelFormatter={(label) => {
    const d = new Date(label);
    if (Number.isNaN(d.valueOf())) return label;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }}
/>


                    <Legend
                      verticalAlign="top"
                      wrapperStyle={{ fontSize: "12px", color: "currentColor" }}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="available"
                      name="Available"
                      fill="#60a5fa"
                      barSize={20}
                      opacity={0.7}
                    />
<Line
  yAxisId="right"
  type="monotone"
  dataKey="fee"
  name="Fee %"
  stroke="#6b7280" // keep line neutral
  strokeWidth={1.5}
  dot={(props: any) => {
    const { cx, cy, value, index } = props;
    let fill = "#16a34a"; // green
    if (value >= 50 && value < 250) fill = "#f59e0b"; // orange
    if (value >= 250) fill = "#dc2626"; // red

    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={3}
        fill={fill}
        stroke="white"
        strokeWidth={1}
      />
    );
  }}
  activeDot={(props: any) => {
    const { cx, cy, value, index } = props;
    let fill = "#16a34a";
    if (value >= 50 && value < 250) fill = "#f59e0b";
    if (value >= 250) fill = "#dc2626";

    return (
      <circle
        key={`active-dot-${index}`}
        cx={cx}
        cy={cy}
        r={5}
        fill={fill}
        stroke="white"
        strokeWidth={2}
      />
    );
  }}
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
