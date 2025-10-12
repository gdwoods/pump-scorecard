"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

import FinalVerdict from "@/components/FinalVerdict";
import { saveScanToHistory, getHistory, HISTORY_STORAGE_KEY } from "@/lib/history";
import { tickerCache, getTickerCacheKey, isCacheValid, getCachedData, setCachedData } from "@/lib/cache";
import ProperCandlestickChart from "@/components/ProperCandlestickChart";
import VolumeProfileChart from "@/components/VolumeProfileChart";
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
import HistoryCard from "@/components/HistoryCard";
import { FullPageSkeleton } from "@/components/LoadingSkeleton";
import PerformanceMonitor from "@/components/PerformanceMonitor";

export default function Page() {
  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState<any>(null);
  const [manualFlags, setManualFlags] = useState<Record<string, boolean>>({});
  const [scoreLog, setScoreLog] = useState<{ label: string; value: number }[]>([]);
  const [adjustedScore, setAdjustedScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  // ---------------------
  // DEBOUNCED SEARCH
  // ---------------------
  const debouncedScan = useMemo(
    () => {
      let timeoutId: NodeJS.Timeout;
      return (ticker: string) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          if (ticker.trim()) {
            scan();
          }
        }, 500); // 500ms delay
      };
    },
    []
  );

  // ---------------------
  // SCAN FUNCTION
  // ---------------------
  const scan = useCallback(async () => {
    if (!ticker) return;
    
    const cacheKey = getTickerCacheKey(ticker);
    
    // Check cache first
    if (isCacheValid(tickerCache, cacheKey)) {
      const cachedData = getCachedData(tickerCache, cacheKey);
      if (cachedData) {
        console.log('🚀 Using cached data for', ticker);
        setResult(cachedData);
        setManualFlags({});
        return;
      }
    }
    
    setIsLoading(true);
    try {
      console.log('🌐 Fetching fresh data for', ticker);
      const res = await fetch(`/api/scan/${ticker}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      const json = await res.json();

      // ✅ Add human-readable droppiness commentary
      if (json.droppinessDetail?.length > 0) {
        const lastSpike = json.droppinessDetail.at(-1);
        if (lastSpike) {
          json.summaryText += lastSpike.retraced
            ? " The most recent spike faded quickly."
            : " The most recent spike held up.";
        }
      }

      // ✅ Add verdict
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

      // ✅ Split promotions into recent vs older
      if (Array.isArray(json.promotions)) {
        const now = Date.now();
        const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
        json.recentPromotions = json.promotions.filter((p: any) => {
          const dateMs = new Date(p.date).getTime();
          return now - dateMs < THIRTY_DAYS;
        });
        json.olderPromotions = json.promotions.filter((p: any) => {
          const dateMs = new Date(p.date).getTime();
          return now - dateMs >= THIRTY_DAYS;
        });
      }

      setResult(json);
      setManualFlags({});

      // Cache the result
      setCachedData(tickerCache, cacheKey, json);

      // Save to history
      saveScanToHistory({
        ticker: ticker.toUpperCase(),
        score: json.weightedRiskScore || 0,
        baseScore: json.weightedRiskScore || 0,
        adjustedScore: json.weightedRiskScore || 0, // Will be updated by useEffect
        verdict: json.summaryVerdict,
        summary: json.summaryText,
        factors: [], // Will be populated by useEffect
        marketCap: json.marketCap,
        price: json.lastPrice,
        volume: json.latestVolume,
        droppinessScore: json.droppinessScore,
        fraudEvidence: json.fraud_evidence,
        promotions: json.promoted_stock,
        riskyCountry: json.risky_country,
      });
      
      // Trigger history refresh
      setHistoryRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error("❌ Scan error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [ticker]);

  // ---------------------
  // EXPORT PDF
  // ---------------------
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

  // ---------------------
  // TOGGLE MANUAL FLAG
  // ---------------------
  const toggleManualFlag = (key: string) => {
    setManualFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

// ---------------------
// SCORE CALCULATION
// ---------------------
useEffect(() => {
  if (!result) return;

  let score = result?.weightedRiskScore ?? 0;
  const log: { label: string; value: number; color?: string }[] = [];

  // --- Base model (only once)
  log.push({
    label: "Base model risk",
    value: score,
    color: "text-gray-400 italic",
  });

  // --- Auto fundamentals
  if (result?.marketCap && result.marketCap < 50_000_000) {
    score += 10;
    log.push({ label: "Microcap (<$50M)", value: 10, color: "text-red-400" });
  }

  if (result?.shortFloat && result.shortFloat > 20) {
    score += 10;
    log.push({
      label: "High short float (>20%)",
      value: 10,
      color: "text-red-400",
    });
  }

  if (result?.insiderOwnership && result.insiderOwnership > 50) {
    score += 5;
    log.push({
      label: "High insider ownership (>50%)",
      value: 5,
      color: "text-red-400",
    });
  }

  // --- Droppiness behavior
  if (result?.droppinessScore < 40) {
    score += 10;
    log.push({
      label: "Spikes hold (risky behavior)",
      value: 10,
      color: "text-red-400",
    });
  } else if (result?.droppinessScore > 70) {
    score -= 5;
    log.push({
      label: "Spikes fade quickly (less risky)",
      value: -5,
      color: "text-green-400",
    });
  }

  // --- Promotions (<30 days)
  if (result?.recentPromotions?.length > 0) {
    score += 15;
    log.push({
      label: "Recent promotion (<30d)",
      value: 15,
      color: "text-red-400",
    });
  }

  // --- Manual flags
  if (manualFlags.pumpSuspicion) {
    score += 15;
    log.push({
      label: "Pump suspicion (manual)",
      value: 15,
      color: "text-red-400",
    });
  }

  if (manualFlags.thinFloat) {
    score += 10;
    log.push({
      label: "Thin float (manual)",
      value: 10,
      color: "text-red-400",
    });
  }

  if (manualFlags.insiders) {
    score += 10;
    log.push({
      label: "Shady insiders (manual)",
      value: 10,
      color: "text-red-400",
    });
  }

  if (manualFlags.other) {
    score += 5;
    log.push({
      label: "Other red flag (manual)",
      value: 5,
      color: "text-red-400",
    });
  }

  // --- Clamp to 0–100
  score = Math.max(0, Math.min(score, 100));

  // ✅ Add only one summary line
  log.push({
    label: "Final adjusted score",
    value: score,
    color: "text-gray-300 font-semibold",
  });

  setAdjustedScore(score);
  setScoreLog(log);

  // Update the most recent scan in history with final adjusted score and factors
  if (result && log.length > 0) {
    try {
      const history = getHistory();
      const mostRecentScan = history.find(scan => 
        scan.ticker.toUpperCase() === ticker.toUpperCase() && 
        Date.now() - scan.timestamp < 30000 // Within last 30 seconds
      );
      
      if (mostRecentScan) {
        mostRecentScan.adjustedScore = score;
        mostRecentScan.factors = log;
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
      }
    } catch (error) {
      console.error('Failed to update scan history:', error);
    }
  }
}, [result, manualFlags, ticker]);


  // ---------------------
  // RENDER
  // ---------------------
  // Don't show full page skeleton - always show input
  // if (isLoading && !result) {
  //   return <FullPageSkeleton />;
  // }

  return (
    <div className="p-6 space-y-6">
      {/* Header restored */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-blue-600">
          <img src="/logo.png" alt="Pump Scorecard Logo" className="h-8 w-8" />
          Booker Mastermind — Pump Scorecard
        </h1>

        <div className="flex gap-2">
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
          onClick={scan}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isLoading ? "Scanning..." : "Scan"}
        </button>
      </div>

      {result && (
        <div className="space-y-6">
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

          {/* Score Breakdown uses same data to ensure consistency */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ScoreBreakdown
              ticker={ticker.toUpperCase()}
              breakdown={scoreLog}
              total={adjustedScore}
            />
            <ProperCandlestickChart result={result} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Criteria
              ticker={ticker}
              result={result}
              manualFlags={manualFlags}
              toggleManualFlag={toggleManualFlag}
            />
            <Fundamentals result={result} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DroppinessCard
              ticker={ticker}
              score={result.droppinessScore}
              detail={result.droppinessDetail || []}
              verdict={result.droppinessVerdict}
            />
            <DroppinessScatter detail={result.droppinessDetail || []} ticker={ticker} />
          </div>

          {/* Volume Profile Chart */}
          <VolumeProfileChart result={result} />

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

          <NewsSection ticker={ticker} items={result.news || []} />
        </div>
      )}

      {/* Historical Analysis - Show even when no current result */}
      {ticker && <HistoryCard ticker={ticker} refreshTrigger={historyRefreshTrigger} />}
      
      {/* Performance Monitor */}
      <PerformanceMonitor />
    </div>
  );
}
