"use client";

import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import {
  buildDtBadgeStats,
  DT_RISK_BAND_LABEL,
  DT_RISK_PILL_CLASS,
  DT_RISK_TILE_CLASS,
  getDtBadgeTooltip,
  type DtBadgeStat,
} from "@/lib/shortCheckHelpers";
import type { ExtractedData } from "@/lib/shortCheckTypes";

function DtBadgeTile({ stat }: { stat: DtBadgeStat }) {
  const shortLabel = stat.label.replace(" Ability", "");
  const tooltip = getDtBadgeTooltip(stat.label);

  return (
    <Tooltip content={tooltip} side="top">
      <div
        className={`rounded-lg border p-3 min-h-[84px] flex flex-col justify-between cursor-help ${DT_RISK_TILE_CLASS[stat.band]}`}
      >
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400 leading-tight">
          {shortLabel}
        </p>
        <span
          className={`inline-flex w-fit px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide ${DT_RISK_PILL_CLASS[stat.band]}`}
        >
          {DT_RISK_BAND_LABEL[stat.band]}
        </span>
      </div>
    </Tooltip>
  );
}

interface DtBadgeGridProps {
  extractedData: ExtractedData;
}

export default function DtBadgeGrid({ extractedData }: DtBadgeGridProps) {
  const stats = buildDtBadgeStats(extractedData);
  if (!stats.length) return null;

  return (
    <Card className="p-4 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
        {stats.map((stat) => (
          <DtBadgeTile key={stat.label} stat={stat} />
        ))}
      </div>
    </Card>
  );
}
