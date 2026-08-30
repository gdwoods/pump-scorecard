"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TaggedText from "@/components/claims/TaggedText";
import { SHOW_AI_THESIS } from "@/lib/config/features";
import { fastVerdictToPromptSlice } from "@/lib/ai/fastVerdictPrompt";
import { buildForensicFactPack } from "@/lib/forensic/buildFactPack";
import { formatBriefPlainText } from "@/lib/forensic/formatBriefForExport";
import type { ShortCheckResult } from "@/lib/shortCheckScoring";
import type { ExtractedData } from "@/lib/shortCheckTypes";
import type { FastVerdict } from "@/lib/fast/types";
import type { AiThesisResult, ThesisPromptInput, ThesisSecEvidence } from "@/lib/ai/types";

interface CapitalPressureSummary {
  score: number;
  status: string;
  summary: string;
  reasons?: Array<{ label: string; points: number; evidence?: ThesisSecEvidence }>;
  events?: Array<{
    eventDate: string;
    type: string;
    title: string;
    description?: string;
    evidence?: ThesisSecEvidence;
  }>;
}

interface ScanDataForThesis {
  weightedRiskScore?: number;
  summaryVerdict?: string;
  droppinessVerdict?: string;
  droppinessScore?: number;
  droppinessDetail?: Array<{ date: string; spikePct: number; retraced: boolean }>;
  capitalPressure?: CapitalPressureSummary;
  news?: Array<{ title?: string; headline?: string; date?: string; published?: string | number | null }>;
  insiderTransactions?: unknown[];
  lastPrice?: number;
  marketCap?: number;
  floatShares?: number;
  sharesOutstanding?: number;
  institutionalOwnership?: number;
  shortFloat?: number;
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

const forwardTagStyles: Record<string, string> = {
  verify: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  conflict: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  opinion: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
};

function ThesisSection({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</p>
      <TaggedText text={text} />
    </div>
  );
}

function buildThesisPayload(
  ticker: string,
  result?: ShortCheckResult | null,
  extractedData?: ExtractedData | null,
  scanData?: ScanDataForThesis | null,
  fastVerdict?: FastVerdict | null
): ThesisPromptInput {
  return {
    ticker,
    fastVerdict: fastVerdict ? fastVerdictToPromptSlice(fastVerdict) : undefined,
    shortCheck: result
      ? {
          rating: result.rating,
          category: result.category,
          walkAwayFlags: result.walkAwayFlags,
          alertLabels: result.alertLabels,
          actualValues: result.scoreBreakdown?.actualValues,
          dataCompleteness: result.dataCompleteness,
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
          float: extractedData.float,
        }
      : undefined,
    scan: scanData
      ? {
          weightedRiskScore: scanData.weightedRiskScore,
          summaryVerdict: scanData.summaryVerdict,
          droppinessVerdict: scanData.droppinessVerdict,
          droppinessScore: scanData.droppinessScore,
          droppinessDetail: scanData.droppinessDetail,
          capitalPressure: scanData.capitalPressure,
          news: scanData.news,
          insiderTransactionsCount: Array.isArray(scanData.insiderTransactions)
            ? scanData.insiderTransactions.length
            : undefined,
          fundamentals: {
            price: scanData.lastPrice,
            marketCap: scanData.marketCap,
            floatShares: scanData.floatShares,
            sharesOutstanding: scanData.sharesOutstanding,
            institutionalOwnership: scanData.institutionalOwnership,
            shortFloat: scanData.shortFloat,
          },
        }
      : undefined,
  };
}

export default function AiThesisCard({
  ticker,
  result,
  extractedData,
  scanData,
  fastVerdict,
}: AiThesisCardProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [thesis, setThesis] = useState<AiThesisResult | null>(null);
  const [lastPayload, setLastPayload] = useState<ThesisPromptInput | null>(null);
  const [exporting, setExporting] = useState(false);
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

    const payload = buildThesisPayload(ticker, result, extractedData, scanData, fastVerdict);

    try {
      const res = await fetch("/api/ai-thesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success && data.thesis) {
        setThesis(data.thesis);
        setLastPayload(payload);
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

  async function handleExportPdf() {
    if (!thesis || !lastPayload || exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/forensic-brief/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: lastPayload, thesis }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "PDF export failed");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${lastPayload.ticker.toUpperCase()}_forensic-brief.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export forensic brief PDF.");
      setStatus("error");
    } finally {
      setExporting(false);
    }
  }

  async function handleCopyBrief() {
    if (!thesis || !lastPayload) return;
    const factPack = buildForensicFactPack(lastPayload);
    const text = formatBriefPlainText(factPack, thesis);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Could not copy brief to clipboard.");
      setStatus("error");
    }
  }

  return (
    <Card className="p-4 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
      <CardContent className="p-0 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">AI Thesis</h3>
          <div className="flex items-center gap-2 shrink-0">
            {status === "success" && thesis && lastPayload && (
              <>
                <Button
                  variant="outline"
                  className="text-sm px-3 py-1.5"
                  onClick={handleCopyBrief}
                  disabled={exporting}
                >
                  Copy Brief
                </Button>
                <Button
                  variant="outline"
                  className="text-sm px-3 py-1.5"
                  onClick={handleExportPdf}
                  disabled={exporting}
                >
                  {exporting ? "Exporting…" : "Export PDF"}
                </Button>
              </>
            )}
            {serviceState === "ready" && (
              <Button
                variant="outline"
                className="text-sm px-3 py-1.5"
                onClick={handleGenerate}
                disabled={!canGenerate || status === "loading"}
              >
                {status === "loading" ? "Generating…" : status === "success" ? "Regenerate" : "Generate AI Thesis"}
              </Button>
            )}
          </div>
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
            {thesis.regulatoryAlert && (
              <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2">
                <TaggedText text={thesis.regulatoryAlert} />
              </div>
            )}

            <TaggedText text={thesis.summary} />
            <TaggedText text={thesis.thesis} />

            {thesis.rubricNarrative && <ThesisSection title="Rubric narrative" text={thesis.rubricNarrative} />}
            {thesis.ceoLens && <ThesisSection title="CEO lens" text={thesis.ceoLens} />}
            {thesis.traderLens && <ThesisSection title="Trader lens" text={thesis.traderLens} />}

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

            {thesis.forwardDates && thesis.forwardDates.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Forward dates
                </p>
                {thesis.forwardDates.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    {f.tag && (
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          forwardTagStyles[f.tag] ?? ""
                        }`}
                      >
                        {f.tag}
                      </span>
                    )}
                    <span className="text-gray-700 dark:text-gray-300">
                      <span className="text-gray-500 dark:text-gray-400">{f.date}</span> — {f.event}
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{f.significance}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {thesis.dataGaps && thesis.dataGaps.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Data gaps
                </p>
                <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside space-y-0.5">
                  {thesis.dataGaps.map((gap, i) => (
                    <li key={i}>
                      <TaggedText text={gap} inline />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {thesis.keyRisks.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  What could invalidate this
                </p>
                <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside space-y-0.5">
                  {thesis.keyRisks.map((risk, i) => (
                    <li key={i}>
                      <TaggedText text={risk} inline />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-700 pt-2">
              AI synthesis (Framework 3.0 lowest-precedence input) — informational only. VERIFY / CONFLICT / OPINION
              tags mark epistemic status. Never overrides a walk-away flag or veto above. Not trade authorization.
              {thesis.reportVersion && (
                <span className="block mt-1">Report schema: {thesis.reportVersion}</span>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
