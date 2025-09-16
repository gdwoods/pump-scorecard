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
import Summary from "@/components/Summary";
import Verdict from "@/components/Verdict";

export default function Page() {
  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const scan = async () => {
    if (!ticker.trim()) return;
    try {
      const res = await fetch(`/api/scan/${ticker}`, { cache: "no-store" });
      const json = await res.json();
      console.log("Scan result:", json); // Debug log
      setResult(json);
    } catch (err) {
      console.error("Scan failed:", err);
    }
  };

  const exportPDF = async () => {
    if (!result) return;

    try {
      // Capture chart image (if needed, you can implement canvas toDataURL here)
      const chartElement = document.querySelector("#chart-capture") as HTMLElement | null;
      let chartImage = null;
      if (chartElement) {
        const canvas = chartElement.querySelector("canvas") as HTMLCanvasElement | null;
        if (canvas) {
          chartImage = canvas.toDataURL("image/png");
        }
      }

      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          result,
          chartImage,
          fraudImages: result.fraudImages || [], // ✅ send fraud images to backend
        }),
      });

      if (!res.ok) {
        throw new Error("PDF export failed");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ticker}-report.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export failed", err);
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

      {/* Input */}
      <div className="flex items-center space-x-4">
        <Input
          placeholder="Enter Ticker (e.g. QMMM)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
        />
        <Button onClick={scan}>Run Scan</Button>
        {result && (
          <Button variant="secondary" onClick={exportPDF}>
            Export PDF
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

          {/* Fundamentals */}
          <Fundamentals result={result} />

          {/* Criteria */}
          <Criteria result={result} />

          {/* Price & Volume Chart */}
          <div id="chart-capture">
            <Chart history={result.history} />
          </div>

          {/* Promotions */}
          <Promotions promotions={result.promotions} />

        {/* SEC Filings */}
<SecFilings
  filings={result.filings}
  allFilings={result.allFilings}
  float={result.floatShares}
  goingConcernDetected={result.goingConcernDetected}
/>


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
