"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { formatNumber } from "@/utils/formatNumber";

export default function Chart({ result }: { result: any }) {
  const chartData =
    result?.history?.map((d: any) => ({
      date: d.date, // e.g., "2025-09-24"
      price: Number(d.close),
      volume: Number(d.volume),
    })) || [];

  const formatCompact = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
    return num.toString();
  };

  const formatMoney = (num: number) => `$${num.toFixed(2)}`;

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow">
      <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
        📈 Price & Volume
      </h2>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            {/* X Axis */}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "currentColor" }}
              minTickGap={20}
            />

            {/* Left Y (Volume) */}
            <YAxis
              yAxisId="left"
              orientation="left"
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickFormatter={formatCompact}
            />

            {/* Right Y (Price) */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickFormatter={(v) => `$${v}`}
            />

import { formatNumber } from "@/utils/formatNumber";

<Tooltip
  contentStyle={{
    backgroundColor: "#1f2937", // dark gray background (Tailwind gray-800)
    borderColor: "#374151",     // border (Tailwind gray-700)
    color: "#f9fafb",           // default text (Tailwind gray-50)
  }}
  labelStyle={{
    color: "#f9fafb",           // ✅ tooltip date is now light in dark mode
    fontWeight: "500",
  }}
  formatter={(value: any, _name: string, item: any) => {
    if (item?.dataKey === "price") {
      return [formatNumber(value, true), "Price"]; // 💵 formatted like $119.40, $6.83B, etc.
    }
    if (item?.dataKey === "volume") {
      return [formatNumber(value), "Volume"];      // 📊 formatted like 3.68M, 773.30K
    }
    return [value, _name];
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

            {/* Volume bars */}
            <Bar
              yAxisId="left"
              dataKey="volume"
              name="Volume"
              fill="#22c55e"
              barSize={20}
              opacity={0.7}
            />

            {/* Price line */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="price"
              name="Price"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 2, strokeWidth: 1 }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
