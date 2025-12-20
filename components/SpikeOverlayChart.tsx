"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
  Scatter,
  LabelList,
} from "recharts";

type Spike = {
  date: string;
  spikePct: number;
  retraced: boolean;
};

type Props = {
  history: { date: string; close: number }[];
  spikes: Spike[];
};

export default function SpikeOverlayChart({ history, spikes }: Props) {
  const data = history.map((h) => ({
    ...h,
    spike: spikes.find((s) => h.date.startsWith(s.date.split("T")[0])),
  }));

  const spikeData = data
    .filter((d) => d.spike)
    .map((d) => ({
      date: d.date,
      close: d.close,
      retraced: d.spike?.retraced,
      spikePct: d.spike?.spikePct,
    }));

  return (
    <div className="p-4 bg-white rounded-xl shadow-md">
      <h2 className="text-lg font-semibold mb-3">Price with Spike Overlay</h2>
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 12 }} />
          <Tooltip />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="close"
            stroke="#2563eb"
            dot={false}
          />

          <Scatter
            yAxisId="left"
            data={spikeData}
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={6}
                  fill={payload.retraced ? "#22c55e" : "#ef4444"}
                  stroke="#111"
                  strokeWidth={1}
                />
              );
            }}
          >
            <LabelList
              dataKey="spikePct"
              position="top"
              formatter={(v: any) => `+${Number(v)}%`}
              style={{ fontSize: 11, fill: "#111" }}
            />
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
