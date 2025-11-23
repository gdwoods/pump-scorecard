"use client";

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
import SentimentCard from "@/components/SentimentCard";
import BorrowDeskCard from "@/components/BorrowDeskCard";
import HistoryCard from "@/components/HistoryCard";
import PerformanceMonitor from "@/components/PerformanceMonitor";
import Link from "next/link";
import { useScanner } from "@/hooks/useScanner";
import { ResultsSkeleton } from "@/components/LoadingSkeleton";

export default function Page() {
  const {
    ticker,
    setTicker,
    result,
    manualFlags,
    scoreLog,
    adjustedScore,
    isLoading,
    historyRefreshTrigger,
    scan,
    debouncedScan,
    toggleManualFlag
  } = useScanner();

  // ---------------------
  // EXPORT PDF
  // ---------------------
  const exportPDF = async () => {
    if (!result) return;
    try {
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: result.ticker }),
      });
      if (!res.ok) throw new Error("PDF export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.ticker}_pump_scorecard.pdf`;
      a.click();
    } catch (err) {
      console.error("❌ PDF export error:", err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header restored */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-blue-600">
          <img src="/logo.png" alt="Pump Scorecard Logo" className="h-8 w-8" />
          Booker Mastermind — Pump Scorecard
        </h1>

        <div className="flex gap-2">
          <Link
            href="/short-check"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            📊 Short Check
          </Link>
          <button
            onClick={exportPDF}
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            Export PDF
          </button>
          <button
            onClick={() =>
              document.documentElement.classList.toggle("dark")
            }
            className="px-4 py-2 border rounded"
          >
            🌓 Toggle Dark Mode
          </button>
        </div>
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          suppressHydrationWarning
          value={ticker}
          onChange={(e) => {
            const value = e.target.value.toUpperCase();
            setTicker(value);
            // Auto-scan after typing (debounced)
            if (value.length >= 1) {
              debouncedScan(value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              scan();
            }
          }}
          placeholder="Enter ticker symbol (auto-scans as you type)"
          className="border px-3 py-2 rounded flex-1"
        />
        <button
          onClick={() => scan()}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isLoading ? "Scanning..." : "Scan"}
        </button>
      </div>

      {isLoading && !result && <ResultsSkeleton />}

      {result && (
        <div className="space-y-6">
          {/* Risk Card and Droppiness Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FinalVerdict
              verdict={result.summaryVerdict}
              summary={result.summaryText}
              score={adjustedScore}
              manualFlags={manualFlags}
              droppinessVerdict={result.droppinessVerdict}
              drivers={scoreLog}
              scoreLog={scoreLog}
              baseScore={result.weightedRiskScore || 0}
            />
            <DroppinessCard
              ticker={ticker}
              score={result.droppinessScore}
              detail={result.droppinessDetail || []}
              verdict={result.droppinessVerdict}
            />
            <SentimentCard ticker={result.ticker} sentiment={result.sentiment} />
          </div>

          {/* Score Breakdown and Fundamentals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ScoreBreakdown
              ticker={ticker.toUpperCase()}
              breakdown={scoreLog}
              total={adjustedScore}
            />
            <Fundamentals result={result} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Criteria
              ticker={ticker}
              result={result}
              manualFlags={manualFlags}
              toggleManualFlag={toggleManualFlag}
            />
            <NewsSection ticker={ticker} items={result.news || []} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Chart result={result} />
            <DroppinessScatter detail={result.droppinessDetail || []} ticker={ticker} />
          </div>


          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Promotions
              ticker={ticker}
              recentPromotions={result.recentPromotions || []}
              olderPromotions={result.olderPromotions || []}
            />
            <FraudEvidence
              ticker={ticker}
              fraudImages={result.fraudImages || []}
            />
            <SecFilings ticker={ticker} filings={result.filings} />
          </div>

          {result.borrowData && (
            <BorrowDeskCard
              ticker={ticker.toUpperCase()}
              borrowData={result.borrowData}
            />
          )}
        </div>
      )}

      {/* Historical Analysis - Show even when no current result */}
      {ticker && <HistoryCard ticker={ticker} refreshTrigger={historyRefreshTrigger} />}

      {/* Performance Monitor */}
      <PerformanceMonitor />
    </div>
  );
}
