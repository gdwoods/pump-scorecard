"use client";

import { Card, CardContent } from "@/components/ui/card";
import { droppinessHex } from "@/lib/droppiness/colors";
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
  const gaugeColor = droppinessHex(score);

  const gaugeData = [
    {
      name: "Droppiness",
      value: score,
      fill: gaugeColor,
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

        <div className="text-xs text-gray-500 dark:text-gray-500 space-y-1">
          <p><strong>Calculation:</strong> Uses Bayesian shrinkage toward 50% to avoid overconfidence from small sample sizes. Recent spikes are weighted more heavily than older ones.</p>
          <p><strong>Higher scores</strong> = more consistent retraces (better for short sellers). <strong>Lower scores</strong> = spikes tend to hold (riskier for shorts).</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start mt-2">
          <div>
            {/* --- Gauge Chart --- */}
            <div className="flex items-center justify-center h-48">
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
                {...({} as any)}
              />
              {/* Score Label */}
              <text
                x="50%"
                y="90%"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="32"
                fontWeight="700"
                fill={gaugeColor}
              >
                {score}%
              </text>
            </RadialBarChart>
          </ResponsiveContainer>
        </div>

            <p className="text-xs text-gray-500 dark:text-gray-500 text-center mt-1">
              {new Date().toLocaleString()}
            </p>

            <p className="text-sm mt-2 text-gray-700 dark:text-gray-300 text-center italic">
              {verdict}
            </p>
          </div>

          <div>
        {Array.isArray(detail) && detail.length > 0 ? (
          <div className="mt-2 md:mt-0">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">
              Recent spikes:
            </h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 max-h-48 overflow-y-auto space-y-0.5">
              {detail.slice().reverse().slice(0, 10).map((d, i) => (
                <li key={i} className="py-0.5">
                  {new Date(d.date).toLocaleDateString()} — {d.spikePct.toFixed(1)}%{" "}
                  {d.retraced ? "(retraced)" : "(held)"}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-2 md:mt-0 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center italic">
              No qualifying spikes detected in the last 18 months. The score reflects the neutral prior (50%).
            </p>
          </div>
        )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
