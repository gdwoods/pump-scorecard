"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import {
  OFFERING_TRAP_TOOLTIP,
  QUICK_SCORE_BAND_TOOLTIP,
  QUICK_SCORE_CONFIDENCE_TOOLTIPS,
  QUICK_SCORE_METRIC_TOOLTIPS,
  QUICK_SCORECARD_HEADER_TOOLTIP,
} from "@/lib/forensic/quickScorecard/metricTooltips";
import type { QuickScorecard, QuickScoreMetric } from "@/lib/forensic/quickScorecard/types";

const BAND_STYLES: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  moderate: "bg-lime-100 text-lime-900 dark:bg-lime-950/40 dark:text-lime-200",
  elevated: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  high: "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200",
  extreme: "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200",
  unknown: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const BAR_STYLES: Record<string, string> = {
  low: "bg-emerald-500",
  moderate: "bg-lime-500",
  elevated: "bg-amber-500",
  high: "bg-orange-500",
  extreme: "bg-red-600",
  unknown: "bg-gray-300 dark:bg-gray-600",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  verified: "Verified",
  estimated: "Estimated",
  stale: "Stale",
  unknown: "Unknown",
};

function ScoreCell({ metric }: { metric: QuickScoreMetric }) {
  const pct = metric.value != null ? (metric.value / 10) * 100 : 0;
  const metricTip = QUICK_SCORE_METRIC_TOOLTIPS[metric.key];
  const confidenceTip = QUICK_SCORE_CONFIDENCE_TOOLTIPS[metric.confidence];

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/80 dark:bg-gray-900/40">
      <div className="flex items-center justify-between gap-2 mb-1">
        <Tooltip content={metricTip} side="top">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 leading-tight underline decoration-dotted decoration-gray-400 dark:decoration-gray-500 cursor-help">
            {metric.label}
          </p>
        </Tooltip>
        <Tooltip content={`${QUICK_SCORE_BAND_TOOLTIP} ${metric.summary}`} side="left">
          <span
            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase cursor-help ${
              BAND_STYLES[metric.band] ?? BAND_STYLES.unknown
            }`}
          >
            {metric.value != null ? `${metric.value}/10` : "—"}
          </span>
        </Tooltip>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-2">
        <div
          className={`h-full rounded-full ${BAR_STYLES[metric.band] ?? BAR_STYLES.unknown}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-gray-500 dark:text-gray-500 line-clamp-2">
        <Tooltip content={confidenceTip} side="bottom">
          <span className="underline decoration-dotted decoration-gray-400 dark:decoration-gray-600 cursor-help">
            {CONFIDENCE_LABEL[metric.confidence]}
          </span>
        </Tooltip>
        {" — "}
        {metric.summary}
      </p>
    </div>
  );
}

interface QuickScorecardCardProps {
  scorecard: QuickScorecard;
}

export default function QuickScorecardCard({ scorecard }: QuickScorecardCardProps) {
  const metrics = [
    scorecard.combined,
    scorecard.offering,
    scorecard.cashNeed,
    scorecard.delisting,
    scorecard.survivalPump,
    scorecard.squeeze,
  ];

  return (
    <Card className="p-4 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
      <CardContent className="p-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Tooltip content={QUICK_SCORECARD_HEADER_TOOLTIP} side="bottom">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 underline decoration-dotted decoration-gray-400 dark:decoration-gray-500 cursor-help w-fit">
                Quick Scorecard
              </h3>
            </Tooltip>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Orthogonal 0–10 risks — filing-first derivatives, not trade authorization
            </p>
          </div>
          {scorecard.offeringTrap && (
            <Tooltip content={OFFERING_TRAP_TOOLTIP} side="left">
              <span className="shrink-0 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white cursor-help">
                Offering Trap
              </span>
            </Tooltip>
          )}
        </div>

        {scorecard.offeringTrap && scorecard.offeringTrapSummary && (
          <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
            {scorecard.offeringTrapSummary}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {metrics.map((m) => (
            <ScoreCell key={m.key} metric={m} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
