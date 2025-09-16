"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Fundamentals from "@/components/Fundamentals";
import Chart from "@/components/Chart";
import Promotions from "@/components/Promotions";
import SecFilings from "@/components/SecFilings";
import Criteria from "@/components/Criteria";
import RiskPill from "@/components/RiskPill";

export default function Page() {
  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const scan = async () => {
    if (!ticker.trim()) return;
    const res = await fetch(`/api/scan/${ticker}`, { cache: "no-store" });
    const json = await res.json();
    setResult(json);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Image src="/logo.png" alt="Logo" width={40} height={40} />
        <h1 className="text-2xl font-bold">
          Booker Mastermind Pump & Dump Risk Scorecard
        </h1>
      </div>

      {/* Input */}
      <div className="flex items-center space-x-4">
        <Input
          placeholder="Enter Ticker (e.g. QMMM)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
        />
        <Button onClick={scan}>Run Scan</Button>
      </div>

      {/* Results */}
      {result && (
        <div ref={reportRef} className="space-y-6">
          {/* Company Header */}
          <Card>
            <CardContent>
              <h2 className="text-xl font-bold">
                {result.companyName || "Unknown"} ({result.ticker})
              </h2>
              <p>
                Last price: $
                {result.last_price !== undefined && result.last_price !== null
                  ? result.last_price.toFixed(2)
                  : "N/A"}{" "}
                | Volume:{" "}
                {result.latest_volume !== undefined &&
                result.latest_volume !== null
                  ? result.latest_volume.toLocaleString()
                  : "N/A"}
              </p>
              <div className="space-y-1">
                <p>
                  Flat Risk Score:{" "}
                  <RiskPill score={result.flatRiskScore ?? 0} />
                  <span className="text-gray-500 ml-2">
                    (percentage of criteria triggered)
                  </span>
                </p>
                <p>
                  Weighted Risk Score:{" "}
                  <RiskPill score={result.weightedRiskScore ?? 0} />
                  <span className="text-gray-500 ml-2">
                    (adjusted for promotions & risky countries)
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Combined Verdict + Summary */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold">🧠 Final Verdict</h3>
              <p
                className={
                  result.summaryVerdict === "High risk"
                    ? "text-red-700 font-bold"
                    : result.summaryVerdict === "Moderate risk"
                    ? "text-yellow-700 font-semibold"
                    : "text-green-700"
                }
              >
                {result.summaryVerdict || "No verdict available"}
              </p>
              <p className="text-sm text-gray-700 mt-2">
                {result.summaryText || "No summary available."}
              </p>
            </CardContent>
          </Card>

          {/* Other Sections */}
          <Fundamentals result={result} />
          <Criteria result={result} />
          <Chart history={result.history || []} />
          <Promotions promotions={result.promotions || []} />
          <SecFilings filings={result.filings || []} />
        </div>
      )}
    </div>
  );
}
