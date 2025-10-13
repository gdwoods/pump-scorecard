"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

export default function DroppinessCard({
  ticker,
  score,
  detail,
  verdict,
}: {
  ticker: string;
  score: number;
  detail: Array<{ date: string; spikePct: number; retraced: boolean }>;
  verdict: string;
}) {
  // --- Dial color logic ---
  const getColor = (score: number) => {
    if (score >= 70) return "#16a34a"; // green - spikes fade
    if (score < 40) return "#dc2626"; // red - spikes hold
    return "#f59e0b"; // yellow - mixed
  };

  const gaugeData = [
    {
      name: "Droppiness",
      value: score,
      fill: getColor(score),
    },
  ];

  return (
    <Card className="p-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <CardContent className="space-y-3">
        <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
          📉 {ticker} Droppiness
        </h2>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Measures how often large intraday spikes retrace within the next few
          sessions, based on price and volume patterns from the{" "}
          <strong>last 18 months</strong>.
        </p>

        {/* --- Gauge Chart --- */}
        <div className="flex items-center justify-center mt-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="80%"
              innerRadius="60%"
              outerRadius="100%"
              startAngle={180}
              endAngle={0}
              data={gaugeData}
            >
              <PolarAngleAxis
                type="number"
                domain={[0, 100]}
                angleAxisId={0}
                tick={false}
              />
              <RadialBar
                minAngle={15}
                background
                clockWise
                dataKey="value"
                cornerRadius={15}
              />
              {/* Score Label */}
              <text
                x="50%"
                y="90%"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="32"
                fontWeight="700"
                fill={getColor(score)}
              >
                {score}%
              </text>
            </RadialBarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-sm mt-2 text-gray-700 dark:text-gray-300 text-center italic">
          {verdict}
        </p>

        {detail && detail.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">
              Recent spikes:
            </h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto space-y-0.5">
              {detail.slice().reverse().slice(0, 10).map((d, i) => (
                <li key={i} className="py-0.5">
                  {new Date(d.date).toLocaleDateString()} — {d.spikePct.toFixed(1)}%{" "}
                  {d.retraced ? "(retraced)" : "(held)"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
