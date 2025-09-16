"use client";

import React from "react";
import {
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/Card";

type ChartProps = {
  history: Array<{
    date: string;
    close: number;
    volume: number;
  }>;
};

export default function Chart({ history }: ChartProps) {
  return (
    <Card>
      <CardContent>
        <h3 className="text-lg font-bold">📉 Price & Volume (6 months)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={history}>
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
              name="Close"
            />
            <Bar
              yAxisId="right"
              dataKey="volume"
              fill="#82ca9d"
              name="Volume"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}