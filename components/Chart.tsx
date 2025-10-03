"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

// ✅ Format date to month + year (e.g. "Oct 2025")
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function Chart({ result }: { result: any }) {
  const data =
    result?.history?.map((h: any) => ({
      date: h.date,
      close: h.close,
      volume: h.volume,
    })) || [];

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-sm">
      <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
        📈 Price & Volume History
      </h2>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            {/* Background grid */}
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />

            {/* ✅ Axes */}
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              minTickGap={50} // ensures spacing between labels
              tick={{ fontSize: 10, fill: "currentColor" }}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              tick={{ fontSize: 10, fill: "currentColor" }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "currentColor" }}
            />

            {/* Tooltip + Legend */}
            <Tooltip
              labelFormatter={(label) =>
                new Date(label).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              }
            />
            <Legend wrapperStyle={{ fontSize: "12px", color: "currentColor" }} />

            {/* ✅ Series */}
            <Bar
              yAxisId="left"
              dataKey="volume"
              name="Volume"
              fill="#22c55e"
              opacity={0.7}
              barSize={12}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="close"
              name="Price"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
