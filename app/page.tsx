"use client";

import { useState } from "react";
import FinalVerdict from "@/components/FinalVerdict";
import Chart from "@/components/Chart";
import CountrySection from "@/components/CountrySection";
import Criteria from "@/components/Criteria";
import Fundamentals from "@/components/Fundamentals";
import Promotions from "@/components/Promotions";
import SecFilings from "@/components/SecFilings";
import FraudEvidence from "@/components/FraudEvidence";

export default function Page() {
  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState<any>(null);
  const [manualFlags, setManualFlags] = useState<Record<string, boolean>>({});

  const scan = async () => {
    if (!ticker) return;
    try {
      const res = await fetch(`/api/scan/${ticker}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      const json = await res.json();
      setResult(json);
      setManualFlags({}); // reset manual flags when scanning new ticker
    } catch (err) {
      console.error("❌ Scan error:", err);
    }
  };

  const exportPDF = async () => {
    if (!result) return;
    try {
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      if (!res.ok) throw new Error("PDF export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ticker}_pump_scorecard.pdf`;
      a.click();
    } catch (err) {
      console.error("❌ PDF export error:", err);
    }
  };

  const toggleManualFlag = (key: string) => {
    setManualFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
       <h1 className="text-2xl font-bold flex items-center gap-2 text-blue-600">
  <img
    src="/logo.png"
    alt="Pump Scorecard Logo"
    className="h-8 w-8"
  />
  Booker Mastermind — Pump Scorecard
</h1>

        <button
          onClick={exportPDF}
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
        >
          Export PDF
        </button>
      </div>

      {/* Ticker Input */}
      <div className="flex gap-2">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Enter ticker symbol"
          className="border px-3 py-2 rounded flex-1"
        />
        <button
          onClick={scan}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500"
        >
          Scan
        </button>
      </div>

      {result && (
        <div className="space-y-6">
          <FinalVerdict
            verdict={result.summaryVerdict}
            summary={result.summaryText}
            score={result.weightedRiskScore}
            manualFlags={manualFlags}
          />

          <Chart result={result} />

          <CountrySection country={result.country} source={result.countrySource} />

          <Criteria
            result={result}
            manualFlags={manualFlags}
            toggleManualFlag={toggleManualFlag}
          />

          <Fundamentals result={result} />

          <Promotions promotions={result.promotions} />

          <SecFilings filings={result.filings} />

          <FraudEvidence fraudImages={result.fraudImages} />
        </div>
      )}
    </div>
  );
}
