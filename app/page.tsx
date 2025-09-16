"use client";

import { useState } from "react";
import Chart from "@/components/Chart";
import Criteria from "@/components/Criteria";
import Fundamentals from "@/components/Fundamentals";
import Promotions from "@/components/Promotions";
import SecFilings from "@/components/SecFilings";
import CountrySection from "@/components/CountrySection";

export default function Page() {
  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  async function scan() {
    if (!ticker) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/scan/${ticker}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Scan failed");
      const json = await res.json();
      setResult(json);
    } catch (err) {
      console.error("❌ Scan error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function exportPDF() {
    if (!ticker) return;
    try {
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        body: JSON.stringify({ ticker }),
      });
      if (!res.ok) throw new Error("PDF export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ticker}_scorecard.pdf`;
      a.click();
    } catch (err) {
      console.error("❌ PDF export error:", err);
    }
  }

  return (
    <div className="w-full p-6 space-y-6">
      {/* App Header */}
      <div className="flex items-center gap-2 mb-4">
        <img src="/logo.png" alt="logo" className="w-8 h-8" />
        <h1 className="text-2xl font-bold text-blue-700">
          Booker Mastermind — Pump Scorecard
        </h1>
      </div>

      {/* Input Controls */}
      <div className="flex gap-2">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Enter ticker..."
          className="border rounded px-2 py-1"
        />
        <button
          onClick={scan}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-1 rounded"
        >
          {loading ? "Scanning..." : "Scan"}
        </button>
        <button
          onClick={exportPDF}
          className="bg-gray-600 text-white px-4 py-1 rounded"
        >
          Export PDF
        </button>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Final Verdict */}
          <div className="bg-green-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Final Verdict</h2>
            <p className="text-gray-800">{result.summaryText}</p>
            <div className="mt-2 text-sm text-gray-600">
              Risk Level:{" "}
              <span className="font-semibold">{result.summaryVerdict}</span>
            </div>
            <div className="mt-1 text-sm text-gray-600">
              Score: {result.weightedRiskScore}%
            </div>
          </div>

          {/* Chart */}
          {result.history && result.history.length > 0 ? (
            <Chart data={result.history} />
          ) : (
            <div className="text-gray-400">📈 Chart data not available.</div>
          )}

          {/* Country */}
          <CountrySection
            country={result.country}
            source={result.countrySource}
          />

          {/* Criteria */}
          <Criteria result={result} />

          {/* Fundamentals */}
          <Fundamentals result={result} />

          {/* Promotions */}
          <Promotions promotions={result.promotions} />

          {/* SEC Filings */}
          <SecFilings
            filings={result.filings}
            allFilings={result.allFilings || []}
            float={result.floatShares}
            goingConcernDetected={result.goingConcernDetected}
          />

          {/* Fraud Evidence */}
          <div className="p-4 border rounded">
            <h2 className="text-lg font-semibold mb-2">⚠️ Fraud Evidence</h2>
            {result.fraudImages && result.fraudImages.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {result.fraudImages.map((img: any, idx: number) => (
                  <div key={idx} className="flex flex-col items-center">
                    <a href={img.full} target="_blank" rel="noopener noreferrer">
                      <img
                        src={img.thumb || img.full}
                        alt="fraud evidence"
                        className="rounded shadow"
                      />
                    </a>
                    {img.approvedAt && (
                      <span className="text-xs text-gray-500 mt-1">
                        {new Date(img.approvedAt).toISOString().split("T")[0]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-600">No fraud images found.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
