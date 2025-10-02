"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Brush,
} from "recharts";

export default function DroppinessChart({
  detail,
}: {
  detail: { date: string; spikePct: number; retraced: boolean }[];
}) {
  const today = Date.now();

  // Filter out any future dates and split into Held vs Retraced
  const dataHeld = detail
    .filter((d) => !d.retraced && new Date(d.date).getTime() <= today)
    .map((d) => ({
      date: new Date(d.date).getTime(),
      spikePct: d.spikePct,
    }));

  const dataRetraced = detail
    .filter((d) => d.retraced && new Date(d.date).getTime() <= today)
    .map((d) => ({
      date: new Date(d.date).getTime(),
      spikePct: d.spikePct,
    }));

  // Scale dot size by spike %
  const sizeFn = (spikePct: number) => Math.min(12, 4 + spikePct / 30);

  // Custom legend
  const renderLegend = () => (
    <div className="flex space-x-4 text-sm mb-2">
      <span className="flex items-center">
        <span className="w-3 h-3 rounded-full bg-green-500 inline-block mr-1"></span>
        Held
      </span>
      <span className="flex items-center">
        <span className="w-3 h-3 rounded-full bg-red-500 inline-block mr-1"></span>
        Retraced
      </span>
    </div>
  );

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-lg font-semibold mb-2">📉 Spike Scatter (Droppiness)</h2>
      <ResponsiveContainer width="100%" height={350}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 50, left: 50 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            type="number"
            domain={["auto", () => Date.now()]} // clamp max = today
            tickFormatter={(ts) => new Date(ts).toISOString().split("T")[0]}
            angle={-30}
            textAnchor="end"
          />
          <YAxis
            dataKey="spikePct"
            domain={[0, "dataMax + 50"]}
            label={{ value: "Spike %", angle: -90, position: "insideLeft" }}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            labelFormatter={() => ""} // suppress duplicate label
            formatter={(value: any, _name: any, props: any) => {
              if (props.dataKey === "spikePct") {
                const dateStr = new Date(props.payload.date)
                  .toISOString()
                  .split("T")[0];
                return [`${value}% (${dateStr})`, props.name];
              }
              return null;
            }}
          />
          <Legend verticalAlign="top" content={renderLegend} />

          {/* Held series */}
          <Scatter
            name="Held"
            data={dataHeld}
            dataKey="spikePct"
            shape={(props) => (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={sizeFn(props.payload.spikePct)}
                fill="#22c55e"
              />
            )}
          />

          {/* Retraced series */}
          <Scatter
            name="Retraced"
            data={dataRetraced}
            dataKey="spikePct"
            shape={(props) => (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={sizeFn(props.payload.spikePct)}
                fill="#ef4444"
              />
            )}
          />

          <Brush
            dataKey="date"
            height={30}
            stroke="#8884d8"
            tickFormatter={(ts) => new Date(ts).toISOString().split("T")[0]}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
