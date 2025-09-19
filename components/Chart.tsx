"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
} from "recharts";

export default function Chart({ result }: { result: any }) {
  if (!result?.history) return null;

  return (
    <div className="w-full h-96">
      <ResponsiveContainer>
        <LineChart data={result.history}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" hide />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip />
          <Bar
            yAxisId="right"
            dataKey="volume"
            fill="#16a34a" // ✅ green bars
            opacity={0.4}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="close"
            stroke="#2563eb"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
