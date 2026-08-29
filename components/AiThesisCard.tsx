"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SHOW_AI_THESIS } from "@/lib/config/features";
import { fastVerdictToPromptSlice } from "@/lib/ai/fastVerdictPrompt";
import type { ShortCheckResult } from "@/lib/shortCheckScoring";
import type { ExtractedData } from "@/lib/shortCheckTypes";
import type { FastVerdict } from "@/lib/fast/types";
import type { AiThesisResult, ThesisPromptInput } from "@/lib/ai/types";

interface CapitalPressureSummary {
  score: number;
  status: string;
  summary: string;
  reasons: Array<{ label: string; points: number }>;
}

interface ScanDataForThesis {
  weightedRiskScore?: number;
  summaryVerdict?: string;
  droppinessVerdict?: string;
  capitalPressure?: CapitalPressureSummary;
  news?: Array<{ title?: string; headline?: string; date?: string; published?: string | number | null }>;
  insiderTransactions?: unknown[];
}

interface AiThesisCardProps {
  ticker?: string;
  result?: ShortCheckResult | null;
  extractedData?: ExtractedData | null;
  scanData?: ScanDataForThesis | null;
  fastVerdict?: FastVerdict | null;
}

const significanceStyles: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  low: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  stale: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
};

export default function AiThesisCard({
  ticker,
  result,
  extractedData,
  scanData,
  fastVerdict,
}: AiThesisCardProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [thesis, setThesis] = useState<AiThesisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serviceState, setServiceState] = useState<"checking" | "ready" | "unconfigured" | "disabled">(
    "checking"
  );

  useEffect(() => {
    if (!SHOW_AI_THESIS) {
      setServiceState("disabled");
      return;
    }
    let cancelled = false;
    fetch("/api/ai-thesis")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.enabled) {
          setServiceState("disabled");
        } else if (!data.configured) {
          setServiceState("unconfigured");
        } else {
          setServiceState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setServiceState("unconfigured");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!SHOW_AI_THESIS || serviceState === "disabled") {
    return null;
  }

  const canGenerate =
    serviceState === "ready" && Boolean(ticker) && (Boolean(result) || Boolean(scanData) || Boolean(fastVerdict));

  async function handleGenerate() {
    if (!ticker || serviceState !== "ready") return;
    setStatus("loading");
    setError(null);

    const payload: ThesisPromptInput = {
      ticker,
      fastVerdict: fastVerdict ? fastVerdictToPromptSlice(fastVerdict) : undefined,
      shortCheck: result
        ? {
            rating: result.rating,
            category: result.category,
            walkAwayFlags: result.walkAwayFlags,
            alertLabels: result.alertLabels,
            actualValues: result.scoreBreakdown?.actualValues,
          }
        : undefined,
      extractedData: extractedData
        ? {
            recentNews: extractedData.recentNews,
            recentNewsDate: extractedData.recentNewsDate,
            newsStatus: extractedData.newsStatus,
            priceSpikePct: extractedData.priceSpikePct,
            currentPrice: extractedData.currentPrice,
            atmShelfStatus: extractedData.atmShelfStatus,
          }
        : undefined,
      scan: scanData
        ? {
            weightedRiskScore: scanData.weightedRiskScore,
            summaryVerdict: scanData.summaryVerdict,
            droppinessVerdict: scanData.droppinessVerdict,
            capitalPressure: scanData.capitalPressure,
            news: scanData.news,
            insiderTransactionsCount: Array.isArray(scanData.insiderTransactions)
              ? scanData.insiderTransactions.length
              : undefined,
          }
        : undefined,
    };

    try {
      const res = await fetch("/api/ai-thesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success && data.thesis) {
        setThesis(data.thesis);
        setStatus("success");
      } else {
        setError(data.error || "AI thesis unavailable right now.");
        setStatus("error");
      }
    } catch {
      setError("Could not reach the AI thesis service.");
      setStatus("error");
    }
  }

  return (
    <Card className="p-4 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
      <CardContent className="p-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">AI Thesis</h3>
          {serviceState === "ready" && (
            <Button
              variant="outline"
              className="text-sm px-3 py-1.5 shrink-0"
              onClick={handleGenerate}
              disabled={!canGenerate || status === "loading"}
            >
              {status === "loading" ? "Generating…" : status === "success" ? "Regenerate" : "Generate AI Thesis"}
            </Button>
          )}
        </div>

        {serviceState === "checking" && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Checking AI thesis availability…</p>
        )}

        {serviceState === "unconfigured" && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            AI thesis is not configured on this deployment (missing <code>GROQ_API_KEY</code>).
          </p>
        )}

        {serviceState === "ready" && !canGenerate && status === "idle" && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Run a scan first — the thesis synthesizes Fast Verdict, Short Check score, and scan data above.
          </p>
        )}

        {status === "error" && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {error}{" "}
            <button className="underline" onClick={handleGenerate} disabled={!canGenerate}>
              Retry
            </button>
          </p>
        )}

        {status === "success" && thesis && (
          <div className="space-y-3">
            <p className="text-sm text-gray-800 dark:text-gray-200">{thesis.summary}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{thesis.thesis}</p>

            {thesis.catalysts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Catalysts
                </p>
                {thesis.catalysts.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                        significanceStyles[c.significance] || significanceStyles.low
                      }`}
                    >
                      {c.significance}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {c.description}
                      {c.date && <span className="text-gray-400 dark:text-gray-500"> — {c.date}</span>}
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{c.rationale}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {thesis.keyRisks.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  What could invalidate this
                </p>
                <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside space-y-0.5">
                  {thesis.keyRisks.map((risk, i) => (
                    <li key={i}>{risk}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-700 pt-2">
              AI synthesis (Framework 3.0 lowest-precedence input) — informational only. Never overrides a walk-away
              flag or veto above. Not trade authorization.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
