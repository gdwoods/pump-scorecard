"use client";

import { useState, useMemo, useCallback, Suspense } from "react";

import { saveScanToHistory } from "@/lib/history";
import { tickerCache, getTickerCacheKey, isCacheValid, getCachedData, setCachedData } from "@/lib/cache";
import Chart from "@/components/Chart";
import Fundamentals from "@/components/Fundamentals";
import Promotions from "@/components/Promotions";
import SecFilings from "@/components/SecFilings";
import NewsSection from "@/components/NewsSection";
import DroppinessCard from "@/components/DroppinessCard";
import DroppinessScatter from "@/components/DroppinessChart";
import BorrowDeskCard from "@/components/BorrowDeskCard";
import CapitalPressureCard from "@/components/CapitalPressureCard";
import AiThesisCard from "@/components/AiThesisCard";
import HistoryCard from "@/components/HistoryCard";
import PerformanceMonitor from "@/components/PerformanceMonitor";
import Link from "next/link";
import PumpScorecardUrlBootstrap from "@/components/PumpScorecardUrlBootstrap";
import { PAGE_CONTENT_CLASS } from "@/lib/ui/pageLayout";

export default function Page() {
  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  const scan = useCallback(async (tickerOverride?: string) => {
    const targetTicker = (tickerOverride ?? ticker).trim();
    if (!targetTicker) return;

    const cacheKey = getTickerCacheKey(targetTicker);

    if (isCacheValid(tickerCache, cacheKey)) {
      const cachedData = getCachedData(tickerCache, cacheKey);
      if (cachedData) {
        setResult(cachedData);
        setTicker("");
        return;
      }
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/scan/${targetTicker}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      const json = await res.json();

      if (json.droppinessScore === 0 && !json.droppinessDetail?.length) {
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

      if (Array.isArray(json.promotions)) {
        const now = Date.now();
        const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
        json.recentPromotions = json.promotions.filter((p: { date: string }) => {
          const dateMs = new Date(p.date).getTime();
          return now - dateMs < THIRTY_DAYS;
        });
        json.olderPromotions = json.promotions.filter((p: { date: string }) => {
          const dateMs = new Date(p.date).getTime();
          return now - dateMs >= THIRTY_DAYS;
        });
      }

      setResult(json);
      setCachedData(tickerCache, cacheKey, json);

      const cpScore = json.capitalPressure?.score;
      saveScanToHistory({
        ticker: targetTicker.toUpperCase(),
        score: json.droppinessScore ?? 0,
        baseScore: json.droppinessScore ?? 0,
        adjustedScore: cpScore ?? json.droppinessScore ?? 0,
        verdict: json.summaryVerdict ?? "Low risk",
        summary: [json.droppinessVerdict, json.capitalPressure?.summary].filter(Boolean).join(" · "),
        factors: [],
        marketCap: json.marketCap,
        price: json.lastPrice,
        volume: json.latestVolume,
        droppinessScore: json.droppinessScore,
        fraudEvidence: false,
        promotions: json.promoted_stock,
        riskyCountry: json.risky_country,
      });

      setHistoryRefreshTrigger((prev) => prev + 1);
      setTicker("");
    } catch (err) {
      console.error("Scan error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [ticker]);

  const debouncedScan = useMemo(() => {
    let timeoutId: NodeJS.Timeout;
    return (nextTicker: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const t = nextTicker.trim();
        if (t) void scan(t);
      }, 500);
    };
  }, [scan]);

  const exportPDF = async () => {
    if (!result) return;
    try {
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: result.ticker,
          scan: {
            ticker: result.ticker,
            companyName: result.companyName,
            lastPrice: result.lastPrice,
            droppinessScore: result.droppinessScore,
            droppinessVerdict: result.droppinessVerdict,
            capitalPressure: result.capitalPressure,
            marketCap: result.marketCap,
            floatShares: result.floatShares,
          },
        }),
      });
      if (!res.ok) throw new Error("PDF export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.ticker}_pump_scorecard.pdf`;
      a.click();
    } catch (err) {
      console.error("PDF export error:", err);
    }
  };

  const activeTicker = result?.ticker || ticker;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className={PAGE_CONTENT_CLASS}>
      <Suspense fallback={null}>
        <PumpScorecardUrlBootstrap onRun={(sym) => scan(sym)} />
      </Suspense>

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-blue-600">
          <img src="/logo.png" alt="Pump Scorecard Logo" className="h-8 w-8" />
          Booker Mastermind — Pump Scorecard
        </h1>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Short Check
          </Link>
          <button
            onClick={exportPDF}
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            Export PDF
          </button>
          <button
            onClick={() => document.documentElement.classList.toggle("dark")}
            className="px-4 py-2 border rounded"
          >
            Toggle Dark Mode
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={ticker}
          onChange={(e) => {
            const value = e.target.value.toUpperCase();
            setTicker(value);
            if (value.length >= 1) debouncedScan(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") scan();
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

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DroppinessCard
              ticker={activeTicker}
              score={result.droppinessScore}
              detail={result.droppinessDetail || []}
              verdict={result.droppinessVerdict}
            />
            {result.capitalPressure ? (
              <CapitalPressureCard
                ticker={activeTicker.toUpperCase()}
                data={result.capitalPressure}
              />
            ) : (
              <div className="p-6 border rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400">
                Capital Pressure data unavailable for this scan.
              </div>
            )}
          </div>

          <Fundamentals result={result} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Chart result={result} />
            <DroppinessScatter detail={result.droppinessDetail || []} ticker={activeTicker} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Promotions
              ticker={activeTicker}
              recentPromotions={result.recentPromotions || []}
              olderPromotions={result.olderPromotions || []}
            />
            <SecFilings ticker={activeTicker} filings={result.filings} />
          </div>

          <NewsSection ticker={activeTicker} items={result.news || []} />

          <AiThesisCard
            ticker={activeTicker}
            scanData={{
              droppinessVerdict: result.droppinessVerdict,
              capitalPressure: result.capitalPressure,
              news: result.news,
              insiderTransactions: result.insiderTransactions,
            }}
          />

          {result.borrowData && (
            <BorrowDeskCard ticker={activeTicker.toUpperCase()} borrowData={result.borrowData} />
          )}
        </div>
      )}

      {activeTicker && (
        <HistoryCard ticker={activeTicker} refreshTrigger={historyRefreshTrigger} />
      )}

      <PerformanceMonitor />
      </div>
    </div>
  );
}
