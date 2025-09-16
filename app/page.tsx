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
import Verdict from "@/components/Verdict";
import RiskPill from "@/components/RiskPill";

export default function Page() {
  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // Scan handler
  const scan = async () => {
    if (!ticker.trim()) return;
    try {
      const res = await fetch(`/api/scan/${ticker}`, { cache: "no-store" });
      const json = await res.json();
      console.log("Scan result:", json);
      setResult(json);
    } catch (err) {
      console.error("Scan failed:", err);
    }
  };

  // Export PDF handler
  const exportPDF = async () => {
    if (!result) return;

    // Capture chart canvas (if present)
    let chartImage = null;
    const chartCanvas = document.querySelector("canvas");
    if (chartCanvas) {
      chartImage = (chartCanvas as HTMLCanvasElement).toDataURL("image/png");
    }

    try {
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, result, chartImage }),
      });

      if (!res.ok) {
        throw new Error("PDF export failed");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ticker}-report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("Export failed:", err);
    }
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

      {/* Input + Buttons */}
      <div className="flex items-center space-x-4">
        <Input
          placeholder="Enter Ticker (e.g. QMMM)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
        />
        <Button onClick={scan}>Run Scan</Button>
        {result && (
          <Button onClick={exportPDF} variant="outline">
            📄 Export Full Report (PDF)
          </Button>
        )}
      </div>

      {/* Results */}
      {result && (
        <div ref={reportRef} className="space-y-6">
          {/* Final Verdict */}
          <Verdict
            verdict={result.summaryVerdict}
            summary={result.summaryText}
          />

          {/* Risk Scores */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold">📊 Risk Scores</h3>
              <p>
                Flat Risk Score:{" "}
                <RiskPill score={result.flatRiskScore} />{" "}
                <span className="text-gray-500 ml-2">
                  (percentage of criteria triggered)
                </span>
              </p>
              <p>
                Weighted Risk Score:{" "}
                <RiskPill score={result.weightedRiskScore} />{" "}
                <span className="text-gray-500 ml-2">
                  (adjusted for promotions, fraud evidence & risky countries)
                </span>
              </p>
            </CardContent>
          </Card>

          {/* Fundamentals */}
          <Fundamentals result={result} />

          {/* Criteria */}
          <Criteria result={result} />

          {/* Price & Volume Chart */}
          <Chart history={result.history} />

          {/* Promotions */}
          <Promotions promotions={result.promotions} />

          {/* SEC Filings */}
          <SecFilings filings={result.filings} />

          {/* Fraud Evidence */}
          {result.fraudImages && result.fraudImages.length > 0 ? (
            <Card>
              <CardContent>
                <h3 className="text-lg font-bold">⚠️ Fraud Evidence</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {result.fraudImages.map(
                    (
                      img: { full: string; thumb: string; approvedAt: string },
                      idx: number
                    ) => (
                      <div key={idx}>
                        <a
                          href={img.full}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={img.thumb}
                            alt={`Fraud screenshot ${idx + 1} for ${result.ticker}`}
                            className="w-full h-32 object-cover rounded-lg shadow hover:opacity-80 transition"
                          />
                        </a>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(img.approvedAt).toLocaleDateString()}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <h3 className="text-lg font-bold">⚠️ Fraud Evidence</h3>
                <p className="text-sm text-gray-500">
                  No fraud images found for this ticker.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
