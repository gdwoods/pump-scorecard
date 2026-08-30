"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import AppNav from "@/components/AppNav";
import FastVerdictCard from "@/components/short-check/FastVerdictCard";
import DroppinessCard from "@/components/DroppinessCard";
import Chart from "@/components/Chart";
import DroppinessScatter from "@/components/DroppinessChart";
import Fundamentals from "@/components/Fundamentals";
import SecFilings from "@/components/SecFilings";
import NewsSection from "@/components/NewsSection";
import BorrowDeskCard from "@/components/BorrowDeskCard";
import SentimentCard from "@/components/SentimentCard";
import InsiderTransactionOverlay from "@/components/InsiderTransactionOverlay";
import CapitalPressureCard from "@/components/CapitalPressureCard";
import QuickScorecardCard from "@/components/forensic/QuickScorecardCard";
import AiThesisCard from "@/components/AiThesisCard";
import { PairGrid } from "@/components/layout/PairGrid";
import type { FastVerdict } from "@/lib/fast/types";
import { SHOW_FAST_VERDICT_UI, SHOW_AI_THESIS } from "@/lib/config/features";
import { enrichFastVerdictFromScan } from "@/lib/fast/enrichFromScan";
import { buildQuickScorecard, toQuickScorecardInputFromScan } from "@/lib/forensic/quickScorecard";
import { PAGE_CONTENT_CLASS } from "@/lib/ui/pageLayout";

function FastScanInner() {
  const searchParams = useSearchParams();
  const initial = (searchParams.get("t") || searchParams.get("ticker") || "").toUpperCase();

  const [tickerInput, setTickerInput] = useState(initial);
  const [ticker, setTicker] = useState("");
  const [fastVerdict, setFastVerdict] = useState<FastVerdict | null>(null);
  const [pumpData, setPumpData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didAutoScan, setDidAutoScan] = useState(false);

  const runScan = useCallback(async (symbol: string) => {
    const upper = symbol.trim().toUpperCase();
    if (!upper) return;

    setLoading(true);
    setError(null);
    setTicker(upper);
    setFastVerdict(null);
    setPumpData(null);

    try {
      const scanPromise = fetch(`/api/scan/${encodeURIComponent(upper)}`);
      const fastPromise = SHOW_FAST_VERDICT_UI
        ? fetch(`/api/fast/${encodeURIComponent(upper)}?fmt=json`)
        : null;

      const [scanRes, fastRes] = await Promise.all([
        scanPromise,
        fastPromise ?? Promise.resolve(null),
      ]);

      const scanJson = await scanRes.json().catch(() => null);
      const fastJson =
        fastRes != null ? await fastRes.json().catch(() => null) : null;

      if (!scanRes.ok && (fastRes == null || !fastRes.ok)) {
        throw new Error(
          scanJson?.error || fastJson?.error || `Scan failed (${scanRes.status})`
        );
      }

      if (SHOW_FAST_VERDICT_UI && fastRes?.ok && fastJson) {
        const base = fastJson as FastVerdict;
        const enriched =
          scanRes.ok && scanJson
            ? enrichFastVerdictFromScan(base, scanJson)
            : base;
        setFastVerdict(enriched);
      }
      if (scanRes.ok && scanJson) setPumpData(scanJson);

      if (SHOW_FAST_VERDICT_UI && fastRes && !fastRes.ok) {
        setError(fastJson?.error || `Fast verdict unavailable (${fastRes.status})`);
      } else if (!scanRes.ok) {
        setError(scanJson?.error || `Market enrichment unavailable (${scanRes.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      setTicker("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial && !didAutoScan) {
      setDidAutoScan(true);
      void runScan(initial);
    }
  }, [initial, didAutoScan, runScan]);

  const capitalPressureBlock =
    pumpData?.capitalPressure ? (
      <CapitalPressureCard ticker={ticker.toUpperCase()} data={pumpData.capitalPressure} />
    ) : null;

  const quickScorecard = useMemo(() => {
    if (!ticker || !pumpData) return null;
    return buildQuickScorecard(toQuickScorecardInputFromScan(ticker, fastVerdict, pumpData));
  }, [ticker, fastVerdict, pumpData]);

  const quickScorecardBlock = quickScorecard ? (
    <QuickScorecardCard scorecard={quickScorecard} />
  ) : null;

  const aiThesisBlock =
    SHOW_AI_THESIS && ticker && pumpData ? (
      <AiThesisCard ticker={ticker} scanData={pumpData} fastVerdict={fastVerdict} />
    ) : null;

  const droppinessBlock =
    pumpData?.droppinessScore !== undefined ? (
      <DroppinessCard
        ticker={ticker}
        score={pumpData.droppinessScore}
        detail={pumpData.droppinessDetail || []}
        verdict={pumpData.droppinessVerdict || "No verdict available"}
      />
    ) : null;

  const scatterBlock = pumpData ? (
    <DroppinessScatter detail={pumpData.droppinessDetail || []} ticker={ticker} />
  ) : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className={PAGE_CONTENT_CLASS}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-blue-600 dark:text-blue-400">
              Fast Scan
            </h1>
            <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-1">
              One ticker → Framework 3.0 verdict plus full market enrichment
            </p>
          </div>
          <AppNav
            extra={
              <button
                type="button"
                onClick={() => document.documentElement.classList.toggle("dark")}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Toggle Dark Mode
              </button>
            }
          />
        </div>

        <Card className="p-6 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Enter a ticker once. This runs the fast verdict and the full scan together — no screenshot required.{" "}
              <Link href="/short-check" className="text-blue-600 dark:text-blue-400 underline">
                Have a DT screenshot? Use Short Check
              </Link>
              .
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tickerInput.trim() && !loading) {
                    void runScan(tickerInput);
                  }
                }}
                placeholder="Enter ticker (e.g., DFNS)"
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => void runScan(tickerInput)}
                disabled={!tickerInput.trim() || loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Scanning…" : "Scan"}
              </button>
              {(ticker || fastVerdict || pumpData) && !loading && (
                <button
                  type="button"
                  onClick={() => {
                    setTickerInput("");
                    setTicker("");
                    setFastVerdict(null);
                    setPumpData(null);
                    setError(null);
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </Card>

        {error && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl text-sm text-yellow-800 dark:text-yellow-300">
            {error}
          </div>
        )}

        {SHOW_FAST_VERDICT_UI && (loading || fastVerdict) && (
          <FastVerdictCard verdict={fastVerdict} loading={loading && !fastVerdict} />
        )}

        {loading && !pumpData && (
          <Card className="p-6 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl">
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              Loading market enrichment…
            </p>
          </Card>
        )}

        {ticker && pumpData && !loading && (
          <>
            <PairGrid first={droppinessBlock} second={scatterBlock} breakpoint="xl" />

            {capitalPressureBlock}

            {quickScorecardBlock}

            {aiThesisBlock}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <Fundamentals result={pumpData} />
              <SecFilings
                ticker={ticker}
                filings={pumpData.filings}
                insiderTransactions={pumpData.insiderTransactions}
              />
            </div>

            {pumpData.sentiment && (
              <SentimentCard ticker={ticker} sentiment={pumpData.sentiment} />
            )}

            <Chart result={pumpData} />

            {pumpData.insiderTransactions?.length > 0 && (
              <InsiderTransactionOverlay
                transactions={pumpData.insiderTransactions}
                history={pumpData.history || []}
              />
            )}

            <NewsSection ticker={ticker} items={pumpData.news || []} />

            {pumpData.borrowData && (
              <BorrowDeskCard ticker={ticker} borrowData={pumpData.borrowData} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function FastScanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 text-gray-500">
          Loading Fast Scan…
        </div>
      }
    >
      <FastScanInner />
    </Suspense>
  );
}
