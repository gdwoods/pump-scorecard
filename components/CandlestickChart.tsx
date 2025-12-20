"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { formatNumber } from "@/utils/formatNumber";

interface CandlestickChartProps {
  result: any;
}

interface ChartEntry {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  isGreen: boolean;
}

export default function CandlestickChart({ result }: CandlestickChartProps) {
  const chartData: ChartEntry[] =
    result?.history?.map((d: any) => {
      const open = Number(d.open) || Number(d.close);
      const close = Number(d.close);
      const high = Number(d.high) || Math.max(open, close);
      const low = Number(d.low) || Math.min(open, close);
      const change = close - open;
      const changePercent = open !== 0 ? (change / open) * 100 : 0;

      return {
        date: d.date,
        open,
        high,
        low,
        close,
        volume: Number(d.volume),
        change,
        changePercent,
        isGreen: change >= 0,
      };
    }) || [];

  const formatCompact = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
    return num.toString();
  };

  const formatPrice = (value: number) => {
    return `$${value.toFixed(2)}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow">
      <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
        📊 Candlestick Chart{result?.ticker ? ` — ${result.ticker}` : ""}
      </h2>

      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            {/* X Axis */}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "currentColor" }}
              minTickGap={20}
              tickFormatter={formatDate}
            />

            {/* Left Y (Volume) */}
            <YAxis
              yAxisId="left"
              orientation="left"
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickFormatter={formatCompact}
              domain={[0, 'dataMax']}
            />

            {/* Right Y (Price) */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickFormatter={formatPrice}
            />

            {/* Tooltip */}
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                borderColor: "#374151",
                color: "#f9fafb",
                borderRadius: "8px",
              }}
              labelStyle={{
                color: "#f9fafb",
                fontWeight: "500",
              }}
              formatter={(value: any, name: string, item: any) => {
                const data = item.payload;
                if (name === "OHLC") {
                  return [
                    <div key="ohlc" className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Open:</span>
                        <span className="font-mono">{formatPrice(data.open)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>High:</span>
                        <span className="font-mono">{formatPrice(data.high)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Low:</span>
                        <span className="font-mono">{formatPrice(data.low)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Close:</span>
                        <span className="font-mono">{formatPrice(data.close)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-gray-600">
                        <span>Change:</span>
                        <span className={`font-mono ${data.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {data.change >= 0 ? '+' : ''}{formatPrice(data.change)} ({data.changePercent.toFixed(2)}%)
                        </span>
                      </div>
                    </div>,
                    "OHLC"
                  ];
                }
                if (name === "Volume") {
                  return [formatNumber(value), "Volume"];
                }
                return [value, name];
              }}
              labelFormatter={(label) => {
                const date = new Date(label);
                return date.toLocaleDateString(undefined, {
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
              fill="#6b7280"
              barSize={20}
              opacity={0.3}
            />

            {/* Candlestick bars - High-Low range */}
            <Bar
              yAxisId="right"
              dataKey="high"
              name="OHLC"
              fill="transparent"
              stroke="#3b82f6"
              strokeWidth={1}
              barSize={4}
            >
              {chartData.map((entry: ChartEntry, index: number) => (
                <Cell
                  key={`candle-${index}`}
                  fill={entry.isGreen ? "#22c55e" : "#ef4444"}
                  stroke={entry.isGreen ? "#16a34a" : "#dc2626"}
                  strokeWidth={1}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Chart Legend */}
      <div className="mt-3 flex items-center justify-center space-x-6 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span className="text-gray-600 dark:text-gray-400">Bullish (Close greater than Open)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 border border-red-500 rounded"></div>
          <span className="text-gray-600 dark:text-gray-400">Bearish (Close less than Open)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-gray-400 rounded opacity-30"></div>
          <span className="text-gray-600 dark:text-gray-400">Volume</span>
        </div>
      </div>
    </div>
  );
}