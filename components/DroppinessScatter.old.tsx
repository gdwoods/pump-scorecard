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

export default function DroppinessScatter({
  detail,
}: {
  detail: { date: string; spikePct: number; retraced: boolean }[];
}) {
  if (!detail || detail.length === 0) return null;

  return (
    <div className="w-full h-96">
      <h2 className="text-lg font-bold mb-2">Spike Scatter (Droppiness)</h2>
      <ResponsiveContainer>
        <ScatterChart>
          <CartesianGrid />
          <XAxis dataKey="date" tick={false} />
          <YAxis
            dataKey="spikePct"
            name="Spike %"
            unit="%"
            domain={["auto", "auto"]}
          />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter
            data={detail.map((d) => ({
              ...d,
              spikePct: d.spikePct,
            }))}
            fill="#f59e0b"
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
