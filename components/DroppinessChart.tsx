"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function DroppinessChart({
  detail,
}: {
  detail: { date: string; spikePct: number; retraced: boolean }[];
}) {
  const data = detail.map((d) => ({
    date: d.date,
    spikePct: d.spikePct,
    retraced: d.retraced,
  }));

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-lg font-semibold mb-2">Spike Scatter</h2>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart>
          <CartesianGrid />
          <XAxis
            dataKey="date"
            name="Date"
            tick={false}
            interval="preserveStartEnd"
          />
          <YAxis dataKey="spikePct" name="% Gain" />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter
            name="Spikes"
            data={data}
            fill="#ef4444"
            shape="circle"
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
