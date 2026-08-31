"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ScoreBreakdown } from "@/lib/shortCheckScoring";
import { ExtractedData } from "@/lib/shortCheckTypes";
import {
  getRedFlagTags,
  getCategoryExplanation,
  getScoreBreakdownItems,
  getScoreContributionLevel,
  getTopScoreDrivers,
  SCORE_LEVEL_LABEL,
  SCORE_LEVEL_TOOLTIP,
  SCORE_LEVEL_PILL_CLASS,
  SCORE_LEVEL_TILE_CLASS,
  SCORE_SUMMARY_LABELS,
  type ScoreBreakdownItem,
} from "@/lib/shortCheckHelpers";
import {
  droppinessTailwindClass,
  parseDroppinessScoreFromText,
} from "@/lib/droppiness/colors";
import { Tooltip } from "@/components/ui/tooltip";

interface ShortCheckScoreBreakdownProps {
  breakdown: ScoreBreakdown;
  total: number;
  data: ExtractedData;
  category?: string;
  walkAwayFlags?: string[];
}

function totalRatingStyle(total: number): string {
  if (total >= 70) return "text-red-500 dark:text-red-400";
  if (total >= 40) return "text-amber-500 dark:text-amber-400";
  if (total >= 20) return "text-sky-500 dark:text-sky-400";
  return "text-emerald-500 dark:text-emerald-400";
}

function categoryBadgeClass(category?: string): string {
  if (!category) return "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  if (category.includes("High-Priority")) return "bg-red-600 text-white";
  if (category.includes("Moderate")) return "bg-amber-500 text-white";
  if (category.includes("Speculative")) return "bg-sky-600 text-white";
  return "bg-gray-500 text-white";
}

function SummaryTile({ item, data, breakdown }: { item: ScoreBreakdownItem; data: ExtractedData; breakdown: ScoreBreakdown }) {
  const level = getScoreContributionLevel(item.value, item.max, item.min);
  const explanation = getCategoryExplanation(item.label);
  const redFlag = getRedFlagTags(item.label, breakdown, data);
  const shortLabel = item.label.replace(" Ability", "").replace("Historical ", "");

  return (
    <Tooltip
      content={`${explanation.explanation} Band: ${SCORE_LEVEL_TOOLTIP[level]}`}
      side="top"
    >
      <div
        className={`rounded-lg border p-3 min-h-[88px] flex flex-col justify-between cursor-help ${SCORE_LEVEL_TILE_CLASS[level]}`}
      >
        <div className="flex items-start justify-between gap-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 leading-tight">
            {shortLabel}
          </p>
          {redFlag && (
            <span className="text-[10px]" title={redFlag.tooltip}>
              {redFlag.icon}
            </span>
          )}
        </div>
        <div>
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${SCORE_LEVEL_PILL_CLASS[level]}`}
          >
            {SCORE_LEVEL_LABEL[level]}
          </span>
          {item.actualValue && (
            <p className="mt-1.5 text-[10px] text-gray-600 dark:text-gray-400 line-clamp-2 leading-snug">
              {item.actualValue}
            </p>
          )}
        </div>
      </div>
    </Tooltip>
  );
}

function DetailRow({
  item,
  data,
  breakdown,
}: {
  item: ScoreBreakdownItem;
  data: ExtractedData;
  breakdown: ScoreBreakdown;
}) {
  const min = item.min ?? 0;
  const max = item.max;
  const range = max - min;
  const normalizedValue = item.value - min;
  const percentage = range > 0 ? (normalizedValue / range) * 100 : 0;
  const redFlag = getRedFlagTags(item.label, breakdown, data);
  const explanation = getCategoryExplanation(item.label);
  const level = getScoreContributionLevel(item.value, max, min);

  return (
    <div className="py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-gray-800 dark:text-gray-200">{item.label}</span>
          <Tooltip content={SCORE_LEVEL_TOOLTIP[level]} side="left">
            <span
              className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase cursor-help ${SCORE_LEVEL_PILL_CLASS[level]}`}
            >
              {SCORE_LEVEL_LABEL[level]}
            </span>
          </Tooltip>
          {redFlag && (
            <Tooltip content={redFlag.tooltip} side="right">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                  redFlag.color === "red"
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                    : redFlag.color === "orange"
                      ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                      : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                }`}
              >
                {redFlag.icon} {redFlag.label}
              </span>
            </Tooltip>
          )}
          <Tooltip content={explanation.explanation} side="right">
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              aria-label={`Learn more about ${item.label}`}
            >
              <span className="text-xs">ℹ️</span>
            </button>
          </Tooltip>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 relative hidden sm:block">
            {item.value < 0 ? (
              <div
                className="h-1.5 rounded-full bg-emerald-500 absolute right-0"
                style={{
                  width: `${Math.min(100, Math.abs(item.value / Math.abs(min)) * 100)}%`,
                }}
              />
            ) : (
              <div
                className={`h-1.5 rounded-full ${
                  percentage >= 75 ? "bg-red-500" : percentage >= 40 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, percentage)}%` }}
              />
            )}
          </div>
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300 w-16 text-right">
            {item.value >= 0 ? "+" : ""}
            {item.value.toFixed(1)}
          </span>
        </div>
      </div>
      {item.actualValue && (
        <p
          className={`mt-1 text-xs pl-0.5 ${
            item.label === "Droppiness"
              ? droppinessTailwindClass(parseDroppinessScoreFromText(item.actualValue))
              : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {item.actualValue}
        </p>
      )}
    </div>
  );
}

const GROUP_LABELS: Record<ScoreBreakdownItem["group"], string> = {
  capital: "Dilution & capital",
  structure: "Structure & liquidity",
  catalyst: "Catalyst & timing",
};

export default function ShortCheckScoreBreakdown({
  breakdown,
  total,
  data,
  category,
  walkAwayFlags = [],
}: ShortCheckScoreBreakdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const items = getScoreBreakdownItems(breakdown);
  const summaryItems = SCORE_SUMMARY_LABELS.map(
    (label) => items.find((i) => i.label === label)!
  ).filter(Boolean);
  const topDrivers = getTopScoreDrivers(items, 3);
  const offeringLine = breakdown.actualValues?.offeringAbility;

  const grouped = (["capital", "structure", "catalyst"] as const).map((group) => ({
    group,
    items: items.filter((i) => i.group === group),
  }));

  return (
    <Card className="p-4 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Score Breakdown</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            High / Medium / Low bands match DilutionTracker-style risk — expand for full 12-factor detail
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {category && (
            <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide ${categoryBadgeClass(category)}`}>
              {category.replace(" Short Candidate", "")}
            </span>
          )}
          <div className="text-right">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Rating</span>
            <span className={`text-2xl font-bold tabular-nums ${totalRatingStyle(total)}`}>
              {total.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {walkAwayFlags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {walkAwayFlags.map((flag, i) => (
            <span
              key={i}
              className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200 border border-red-200 dark:border-red-800"
            >
              ⛔ {flag.length > 72 ? `${flag.slice(0, 72)}…` : flag}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
        {summaryItems.map((item) => (
          <SummaryTile key={item.label} item={item} data={data} breakdown={breakdown} />
        ))}
      </div>

      {offeringLine && (
        <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
            Offering ability
          </p>
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{offeringLine}</p>
        </div>
      )}

      {topDrivers.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            Top drivers
          </p>
          <div className="flex flex-wrap gap-2">
            {topDrivers.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-[11px] text-gray-700 dark:text-gray-300"
              >
                <span className="font-medium">{item.label.replace("Historical ", "")}</span>
                <span className="font-mono text-gray-500 dark:text-gray-400">
                  {item.value >= 0 ? "+" : ""}
                  {item.value.toFixed(1)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors py-2 border-t border-gray-200 dark:border-gray-700"
        aria-label={isExpanded ? "Hide full breakdown" : "Show full breakdown"}
      >
        <span>{isExpanded ? "Hide full breakdown" : "Show full 12-factor breakdown"}</span>
        <span>{isExpanded ? "▲" : "▼"}</span>
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-4">
          {grouped.map(({ group, items: groupItems }) => (
            <div key={group}>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400 mb-1">
                {GROUP_LABELS[group]}
              </p>
              <div className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 px-3 bg-gray-50/40 dark:bg-gray-900/20">
                {groupItems.map((item) => (
                  <DetailRow key={item.label} item={item} data={data} breakdown={breakdown} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
