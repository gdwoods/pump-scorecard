"use client";

import { useState } from "react";

import FinalVerdict from "@/components/FinalVerdict";
import Chart from "@/components/Chart";
import Criteria from "@/components/Criteria";
import Fundamentals from "@/components/Fundamentals";
import Promotions from "@/components/Promotions";
import SecFilings from "@/components/SecFilings";
import NewsSection from "@/components/NewsSection";
import FraudEvidence from "@/components/FraudEvidence";
import DroppinessCard from "@/components/DroppinessCard";
import DroppinessScatter from "@/components/DroppinessChart";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import BorrowDeskCard from "@/components/BorrowDeskCard";

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

      // ✅ Enhance summary with last spike info
      if (json.droppinessDetail && json.droppinessDetail.length > 0) {
        const lastSpike = json.droppinessDetail.at(-1);
        if (lastSpike) {
          json.summaryText += lastSpike.retraced
            ? " The most recent spike faded quickly."
            : " The most recent spike held up.";
        }
      }

      // ✅ Add droppiness verdict
      if (
        json.droppinessScore === 0 &&
        (!json.droppinessDetail || json.droppinessDetail.length === 0)
      ) {
        json.droppinessVerdict =
          "No qualifying spikes were detected in the last 18 months — the stock has not shown pump-like behavior recently.";
      } else if (json.droppinessScore >= 70) {
        json.droppinessVerdict =
          "Spikes usually fade quickly — most large moves retraced within a few sessions.";
      } else if (json.droppinessScore < 40) {
        json.droppinessVerdict =
          "Spikes often hold — many large moves remained elevated after the initial run-up.";
      } else {
        json.droppinessVerdict =
          "Mixed behavior — some spikes retraced quickly, while others held their gains.";
      }

      setResult(json);
      setManualFlags({});
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

  // ✅ Combine backend score with fundamentals + manual flags
  let adjustedScore = result?.weightedRiskScore ?? 0;

  if (result?.marketCap && result.marketCap < 50_000_000) adjustedScore += 10;
  if (result?.shortFloat && result.shortFloat > 20) adjustedScore += 10;
  if (result?.insiderOwnership && result.insiderOwnership > 50) adjustedScore += 5;
  if (manualFlags.pumpSuspicion) adjustedScore += 15;
  if (manualFlags.thinFloat) adjustedScore += 10;
  if (manualFlags.insiders) adjustedScore += 10;
  if (manualFlags.other) adjustedScore += 5;
  if (adjustedScore > 100) adjustedScore = 100;

  // ✅ Unified weighting map
  const WEIGHT = {
    sudden_volume_spike: 20,
    sudden_price_spike: 20,
    dilution_offering: 20,
    promoted_stock: 15,
    fraud_evidence: 20,
    risky_country: 15,
    microcap: 10,
    high_short_float: 10,
    high_insider_ownership: 5,
    manual_pump: 15,
    manual_thin_float: 10,
    manual_insiders: 10,
    manual_other: 5,
  };

  // ✅ Build breakdown
  let breakdown: { key: string; label: string; value: number }[] = [];

  // Backend risk factors
  if (result?.sudden_volume_spike)
    breakdown.push({ key: "sudden_volume_spike", label: "Sudden volume spike", value: WEIGHT.sudden_volume_spike });
  if (result?.sudden_price_spike)
    breakdown.push({ key: "sudden_price_spike", label: "Sudden price spike", value: WEIGHT.sudden_price_spike });
  if (result?.dilution_offering)
    breakdown.push({ key: "dilution_offering", label: "Dilution / offering (S-1 / 424B)", value: WEIGHT.dilution_offering });
  if (result?.promoted_stock)
    breakdown.push({ key: "promoted_stock", label: "Promoted stock", value: WEIGHT.promoted_stock });
  if (result?.fraud_evidence)
    breakdown.push({ key: "fraud_evidence", label: "Fraud evidence posted online", value: WEIGHT.fraud_evidence });
  if (result?.risky_country)
    breakdown.push({ key: "risky_country", label: "Risky country", value: WEIGHT.risky_country });

  // Fundamentals
  if (result?.marketCap && result.marketCap < 50_000_000)
    breakdown.push({ key: "microcap", label: "Microcap (<$50M)", value: WEIGHT.microcap });
  if (result?.shortFloat && result.shortFloat > 20)
    breakdown.push({ key: "high_short_float", label: "High short float >20%", value: WEIGHT.high_short_float });
  if (result?.insiderOwnership && result.insiderOwnership > 50)
    breakdown.push({ key: "high_insider_ownership", label: "High insider ownership >50%", value: WEIGHT.high_insider_ownership });

  // Manual flags
  if (manualFlags.pumpSuspicion)
    breakdown.push({ key: "manual_pump", label: "Pump suspicion", value: WEIGHT.manual_pump });
  if (manualFlags.thinFloat)
    breakdown.push({ key: "manual_thin_float", label: "Thin float risk", value: WEIGHT.manual_thin_float });
  if (manualFlags.insiders)
    breakdown.push({ key: "manual_insiders", label: "Shady insiders", value: WEIGHT.manual_insiders });
  if (manualFlags.other)
    breakdown.push({ key: "manual_other", label: "Other red flag", value: WEIGHT.manual_other });

  // ✅ De-dupe by key
  breakdown = Array.from(new Map(breakdown.map((i) => [i.key, i])).values());

  // ✅ Top 3 risk drivers
  const drivers = [...breakdown].sort((a, b) => b.value - a.value).slice(0, 3);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-blue-600">
          <img src="/logo.png" alt="Pump Scorecard Logo" className="h-8 w-8" />
          Booker Mastermind — Pump Scorecard
        </h1>

        <div className="flex gap-2">
          <button onClick={exportPDF} className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700">
            Export PDF
          </button>
          <button
            onClick={() => document.documentElement.classList.toggle("dark")}
            className="px-4 py-2 border rounded"
          >
            🌓 Toggle Dark Mode
          </button>
        </div>
      </div>

      {/* Ticker Input */}
      <div className="flex gap-2">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Enter ticker symbol"
          className="border px-3 py-2 rounded flex-1"
        />
        <button onClick={scan} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
          Scan
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          <FinalVerdict
            verdict={result.summaryVerdict}
            summary={result.summaryText}
            score={adjustedScore}
            manualFlags={manualFlags}
            droppinessVerdict={result.droppinessVerdict}
            drivers={drivers}
          />

          {/* Score Breakdown + Chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ScoreBreakdown
              ticker={result.ticker?.toUpperCase() || ticker.toUpperCase()}
              breakdown={breakdown}
              total={adjustedScore}
            />
            <Chart result={result} />
          </div>

          {/* Criteria + Fundamentals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Criteria ticker={ticker} result={result} manualFlags={manualFlags} toggleManualFlag={toggleManualFlag} />
            <Fundamentals ticker={result.ticker} result={result} />
          </div>

          {/* Droppiness */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DroppinessCard
              ticker={result.ticker}
              score={result.droppinessScore}
              detail={result.droppinessDetail || []}
              verdict={result.droppinessVerdict}
            />
            <DroppinessScatter detail={result.droppinessDetail || []} />
          </div>

          {/* Promotions + Fraud + SEC */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Promotions ticker={result.ticker} promotions={result.promotions} />
            <FraudEvidence ticker={result.ticker} fraudImages={result.fraudImages || []} />
            <SecFilings ticker={result.ticker} filings={result.filings} />
          </div>

          {result.borrowData && (
            <BorrowDeskCard ticker={result.ticker?.toUpperCase() || ticker.toUpperCase()} borrowData={result.borrowData} />
          )}

          <NewsSection ticker={result.ticker} items={result.news || []} />
        </div>
      )}
    </div>
  );
}
