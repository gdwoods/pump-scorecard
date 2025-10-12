"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { formatNumber } from "@/utils/formatNumber";

interface VolumeProfileData {
  price: string;
  volume: number;
  percentage: number;
}

interface VolumeProfileChartProps {
  result: any;
}

export default function VolumeProfileChart({ result }: VolumeProfileChartProps) {
  // Create volume profile data
  const createVolumeProfile = (history: any[]) => {
    if (!history || history.length === 0) return [];

    // Group volume by price levels
    const volumeByPrice: { [key: string]: number } = {};
    let totalVolume = 0;

    history.forEach((day: any) => {
      const volume = Number(day.volume) || 0;
      const price = Number(day.close) || 0;
      
      if (volume > 0 && price > 0) {
        const priceKey = price.toFixed(2);
        volumeByPrice[priceKey] = (volumeByPrice[priceKey] || 0) + volume;
        totalVolume += volume;
      }
    });

    // Convert to array and calculate percentages
    const profileData: VolumeProfileData[] = Object.entries(volumeByPrice)
      .map(([price, volume]) => ({
        price: `$${price}`,
        volume: volume as number,
        percentage: ((volume as number) / totalVolume) * 100,
      }))
      .sort((a, b) => parseFloat(a.price.replace('$', '')) - parseFloat(b.price.replace('$', '')));

    // Take top 20 price levels for better visualization
    return profileData.slice(0, 20);
  };

  const volumeProfileData = createVolumeProfile(result?.history || []);

  const formatVolume = (value: number) => {
    return formatNumber(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Color bars based on volume intensity
  const getBarColor = (percentage: number) => {
    if (percentage > 10) return "#ef4444"; // High volume - red
    if (percentage > 5) return "#f59e0b";  // Medium volume - orange
    if (percentage > 2) return "#22c55e";  // Low volume - green
    return "#6b7280"; // Very low volume - gray
  };

  if (volumeProfileData.length === 0) {
    return (
      <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow">
        <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
          📊 Volume Profile{result?.ticker ? ` — ${result.ticker}` : ""}
        </h2>
        <div className="h-64 flex items-center justify-center text-gray-500">
          <p>No volume data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow">
      <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
        📊 Volume Profile{result?.ticker ? ` — ${result.ticker}` : ""}
      </h2>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={volumeProfileData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            layout="horizontal"
          >
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickFormatter={formatVolume}
            />
            <YAxis
              type="category"
              dataKey="price"
              tick={{ fontSize: 10, fill: "currentColor" }}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                borderColor: "#374151",
                color: "#f9fafb",
                borderRadius: "8px",
              }}
              formatter={(value: any, name: string, item: any) => {
                const data = item.payload;
                return [
                  <div key="volume-profile" className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Price:</span>
                      <span className="font-mono">{data.price}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Volume:</span>
                      <span className="font-mono">{formatVolume(data.volume)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>% of Total:</span>
                      <span className="font-mono">{formatPercentage(data.percentage)}</span>
                    </div>
                  </div>,
                  "Volume Profile"
                ];
              }}
            />
            <Bar dataKey="volume" name="Volume">
              {volumeProfileData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.percentage)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center space-x-4 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded"></div>
          <span className="text-gray-600 dark:text-gray-400">High Volume (&gt;10%)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-orange-500 rounded"></div>
          <span className="text-gray-600 dark:text-gray-400">Medium (5-10%)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span className="text-gray-600 dark:text-gray-400">Low (2-5%)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-gray-500 rounded"></div>
          <span className="text-gray-600 dark:text-gray-400">Very Low (&lt;2%)</span>
        </div>
      </div>
    </div>
  );
}
