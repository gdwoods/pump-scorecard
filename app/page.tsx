"use client";

import { useState } from "react";
import Image from "next/image";
import Chart from "@/components/Chart";
import Criteria from "@/components/Criteria";
import Promotions from "@/components/Promotions";
import SecFilings from "@/components/SecFilings";
import Fundamentals from "@/components/Fundamentals";
import RiskPill from "@/components/RiskPill";
import CountrySection from "@/components/CountrySection";

export default function Page() {
  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/scan/${ticker}`);
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      const json = await res.json();
      setResult(json);
    } catch (e: any) {
      setError(e.message || "Scan failed");
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = async () => {
    if (!result) return;
    try {
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: result.ticker }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.ticker}_scorecard.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF export error:", e);
    }
  };

  return (
    <main className="w-full px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Image src="/logo.png" alt="logo" width={28} height={28} />
        <h1 className="text-2xl font-bold text-blue-700">
          Booker Mastermind — Pump Scorecard
        </h1>
      </div>

      {/* Scan form */}
      <div className="flex items-center gap-2 mb-6">
        <input
          className="border rounded px-3 py-2 w-40"
          placeholder="Ticker"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
        />
        <button
          onClick={scan}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2"
        >
          {loading ? "Scanning..." : "Scan"}
        </button>
        {result && (
          <button
            onClick={exportPDF}
            className="border border-gray-300 rounded px-3 py-2 hover:bg-gray-50"
          >
            📥 Export PDF
          </button>
        )}
      </div>

      {error && <div className="text-red-600">{error}</div>}

      {result ? (
        <div className="space-y-6">
          {/* Final Verdict at top */}
          <div
            className={`border rounded-lg p-4 ${
              result.summaryVerdict === "High risk"
                ? "bg-red-50 border-red-200"
                : result.summaryVerdict === "Moderate risk"
                ? "bg-yellow-50 border-yellow-200"
                : "bg-green-50 border-green-200"
            }`}
          >
            <div className="text-lg font-bold mb-2">Final Verdict</div>
            <RiskPill risk={result.summaryVerdict} />
            <p className="mt-2 text-gray-700">{result.summaryText}</p>
          </div>

          {/* Score + pill row */}
          <div className="flex items-center gap-4">
            <div className="text-lg font-semibold">
              Score: <span>{result.weightedRiskScore ?? 0}%</span>
            </div>
            <RiskPill risk={result.summaryVerdict} />
            <div className="text-gray-600">
              {result.companyName} ({result.ticker})
            </div>
          </div>

          {/* Chart */}
          {result.history && result.history.length > 0 ? (
            <Chart data={result.history} />
          ) : (
            <div className="text-gray-400">📈 Chart data not available.</div>
          )}

          {/* Country */}
          {result.country && result.country !== "Unknown" && (
            <CountrySection
              country={result.country}
              countrySource={result.countrySource}
              showCard={true}
            />
          )}

          {/* Criteria */}
          <Criteria result={result} />

          {/* Fundamentals */}
          <Fundamentals result={result} hideCountryRow />

          {/* Promotions */}
          <Promotions promotions={result.promotions} />

          {/* SEC Filings */}
          <SecFilings
            filings={result.filings ?? []}
            allFilings={result.allFilings ?? []}
            float={result.floatShares}
            goingConcernDetected={result.goingConcernDetected}
          />

          {/* Fraud Evidence */}
          <div className="border rounded-lg p-4">
            <div className="font-semibold mb-2">⚠️ Fraud Evidence</div>
            {result.fraudImages && result.fraudImages.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {result.fraudImages.map((img: any, i: number) => (
                  <a
                    key={i}
                    href={img.full}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      src={img.thumb || img.full}
                      alt="Fraud evidence"
                      className="rounded shadow"
                    />
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-gray-500">No fraud images found.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-gray-500 italic">
          ⏳ Enter a ticker and click Scan to see results.
        </div>
      )}
    </main>
  );
}
