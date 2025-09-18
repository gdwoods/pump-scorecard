"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  Bar,
} from "recharts";

export default function Chart({ result }: { result: any }) {
  if (!result?.history || result.history.length === 0) {
    return <div className="text-gray-400">📈 Chart data not available.</div>;
  }

  return (
    <div className="p-4 rounded-xl bg-white shadow">
      <h2 className="text-lg font-semibold mb-2">📊 Price & Volume (6 months)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={result.history}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="close"
            stroke="#8884d8"
            dot={false}
          />
          <Bar yAxisId="right" dataKey="volume" barSize={20} fill="#82ca9d" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
