"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { cleanFilingText } from "@/lib/capitalPressure/textClean";
import {
  buildCapitalPressureHeadline,
  buildCardCopySummary,
  buildFrameworkNote,
  evidenceAvailabilityText,
  findPinnedEvent,
  formatSharesShort,
  formatUsdShort,
  humanEventType,
  issuanceFieldStatusLabel,
  issuanceUtilization,
  issuanceWindowSummary,
  statusHeadlineLabel,
} from "@/lib/capitalPressure/cardCopy";
import type {
  CapitalEvent,
  CapitalPressureResult,
  EvidenceStatus,
  ScoreReason,
} from "@/lib/capitalPressure/types";
import type { ExtractedData } from "@/lib/shortCheckTypes";
import type { OfferingAbility } from "@/lib/fast/types";

const NEEDS_REVIEW_TIP =
  "Matched a financing-related phrase, but not auto-scored — verify the linked filing.";

const TIMELINE_LEGEND_TIP =
  "Issued = shares sold into the market. Capacity = shelf, ATM, or contractual ability to sell — not confirmed issuance. Needs review = phrase matched; open the SEC link before relying on it.";

type Panel = "timeline" | "detail" | null;

function statusBadgeClass(status: CapitalPressureResult["status"]): string {
  switch (status) {
    case "high":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    case "elevated":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200";
    case "watch":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    default:
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
  }
}

function evidenceStatusClass(status: EvidenceStatus): string {
  switch (status) {
    case "reported":
      return "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100";
    case "partial":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "not_applicable":
      return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200";
  }
}

function isIssuanceEvent(event: CapitalEvent): boolean {
  if (event.isCapacityOnly === true) return false;
  return [
    "registered_direct",
    "private_placement",
    "note_conversion",
    "debt_for_equity",
    "warrant_exercise",
    "prospectus_supplement",
    "equity_line",
    "atm_program",
  ].includes(event.type);
}

function isCapacityEvent(event: CapitalEvent): boolean {
  return event.isCapacityOnly === true;
}

function SecLink({ url, label }: { url?: string; label?: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 dark:text-blue-400 underline text-xs"
    >
      {label || "SEC filing"}
    </a>
  );
}

function TimelineRow({
  event,
  highlighted,
}: {
  event: CapitalEvent;
  highlighted?: boolean;
}) {
  const evidence = event.evidence;
  const capacity = isCapacityEvent(event);
  const issued = isIssuanceEvent(event);
  const description = cleanFilingText(event.description || "");
  const excerpt = cleanFilingText(evidence?.excerpt || "");

  const borderClass = highlighted
    ? "border-red-500 dark:border-red-400"
    : issued
      ? "border-red-400 dark:border-red-500"
      : capacity
        ? "border-sky-300 dark:border-sky-600 opacity-90"
        : "border-slate-300 dark:border-slate-500";

  const rowBg = highlighted
    ? "bg-red-50/70 dark:bg-red-950/30 rounded-r-md -ml-1 pl-3"
    : issued
      ? "bg-red-50/40 dark:bg-red-950/20 rounded-r-md -ml-1 pl-3"
      : "";

  return (
    <li className={`border-l-2 ${borderClass} pl-3 py-2 space-y-1 ${rowBg}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        {highlighted && (
          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 font-medium">
            Top driver
          </span>
        )}
        <span className="font-medium text-gray-800 dark:text-gray-200">{event.eventDate}</span>
        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700">
          {humanEventType(event.type)}
        </span>
        {capacity && (
          <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-100 dark:border-sky-800">
            📋 Capacity
          </span>
        )}
        {issued && (
          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 font-medium">
            🔴 Issued
          </span>
        )}
        {evidence?.confidence === "needs_review" && (
          <Tooltip content={NEEDS_REVIEW_TIP}>
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 cursor-help">
              needs review
            </span>
          </Tooltip>
        )}
      </div>
      <p
        className={`text-sm ${
          capacity
            ? "text-gray-600 dark:text-gray-400"
            : "text-gray-900 dark:text-gray-100 font-medium"
        }`}
      >
        {event.title}
      </p>
      {(description || excerpt) && (
        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
          {description || excerpt}
        </p>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
        {event.sharesIssued != null && Number.isFinite(event.sharesIssued) && (
          <span>Issued: {formatSharesShort(event.sharesIssued)}</span>
        )}
        {event.potentialShares != null && Number.isFinite(event.potentialShares) && (
          <span>Potential: {formatSharesShort(event.potentialShares)}</span>
        )}
        {event.grossProceedsUsd != null && Number.isFinite(event.grossProceedsUsd) && (
          <span>Amount: {formatUsdShort(event.grossProceedsUsd)}</span>
        )}
        <SecLink url={evidence?.documentUrl} label={evidence?.form} />
      </div>
    </li>
  );
}

function ReasonRow({ reason }: { reason: ScoreReason }) {
  return (
    <div className="text-sm space-y-1 border-b border-gray-100 dark:border-gray-700 pb-2 mb-2 last:border-0">
      <div className="flex justify-between gap-2">
        <span className="text-gray-800 dark:text-gray-200">{reason.label}</span>
        <span className="font-semibold text-red-700 dark:text-red-300">+{reason.points}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3">
        {cleanFilingText(reason.evidence?.excerpt ?? "")}
      </p>
      <SecLink url={reason.evidence?.documentUrl} label={`${reason.evidence?.form ?? "SEC"} evidence`} />
    </div>
  );
}

function EventSparkline({ events }: { events: CapitalEvent[] }) {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const recent = sorted.slice(-14);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-0.5 flex-wrap" aria-label="Recent filing activity">
        {recent.map((e) => {
          const label = `${e.eventDate} — ${humanEventType(e.type)}`;
          const issued = isIssuanceEvent(e);
          return (
            <Tooltip key={e.id} content={label} side="top">
              <button
                type="button"
                className="p-1.5 rounded-full hover:bg-gray-200/60 dark:hover:bg-gray-700/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label={label}
              >
                <span
                  className={`block w-2.5 h-2.5 rounded-full ${
                    issued ? "bg-red-500" : "bg-sky-400"
                  }`}
                />
              </button>
            </Tooltip>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-500 dark:text-gray-400">
        {recent.length} events, left (older) → right (newer). Hover or tap a dot for details.
      </p>
    </div>
  );
}

export default function CapitalPressureCard({
  ticker,
  data,
  extractedData,
  capacityQuarters,
  derivedOfferingAbility,
}: {
  ticker: string;
  data?: CapitalPressureResult | null;
  extractedData?: ExtractedData | null;
  capacityQuarters?: number | null;
  derivedOfferingAbility?: OfferingAbility | null;
}) {
  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const [timelineFilter, setTimelineFilter] = useState<
    "all" | "issued" | "capacity" | "needs_review"
  >("all");
  const [copiedSummary, setCopiedSummary] = useState(false);

  const events = data?.events || [];
  const topReason = data?.reasons?.[0];
  const otherReasons = (data?.reasons || []).slice(1);

  const pinned = useMemo(
    () => (data ? findPinnedEvent(events, topReason) : undefined),
    [data, events, topReason]
  );

  const orderedEvents = useMemo(() => {
    if (!pinned) return events;
    return [pinned, ...events.filter((e) => e.id !== pinned.id)];
  }, [events, pinned]);

  const filteredEvents = useMemo(() => {
    return orderedEvents.filter((e) => {
      if (timelineFilter === "all") return true;
      if (timelineFilter === "issued") return isIssuanceEvent(e);
      if (timelineFilter === "capacity") return isCapacityEvent(e);
      if (timelineFilter === "needs_review") {
        return e.evidence?.confidence === "needs_review" || e.scoreEligible === false;
      }
      return true;
    });
  }, [orderedEvents, timelineFilter]);

  const copySummary = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(buildCardCopySummary(ticker, data));
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const togglePanel = (panel: Panel) => {
    setOpenPanel((cur) => (cur === panel ? null : panel));
  };

  if (!data) return null;

  const windowLabel =
    data.windowStart && data.windowEnd
      ? `${data.windowStart} → ${data.windowEnd}`
      : null;
  const windowMeta = [
    windowLabel,
    data.filingsScanned != null
      ? `${data.filingsScanned} filing${data.filingsScanned === 1 ? "" : "s"}`
      : null,
    data.latestVerifiedAt ? `verified ${data.latestVerifiedAt.slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (!data.available) {
    return (
      <Card className="p-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <CardContent className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {ticker} Capital Pressure
          </h2>
          {windowMeta && <p className="text-xs text-gray-500">{windowMeta}</p>}
          <p className="text-sm text-gray-700 dark:text-gray-300">
            SEC scan unavailable — {data.unavailableReason || "filings could not be verified"}.
            Missing data is not a risk signal.
          </p>
          <SecLink
            url={
              data.edgarSearchUrl ||
              "https://www.sec.gov/edgar/searchedgar/companysearch.html"
            }
            label={`EDGAR manual check${data.cik ? ` (CIK ${data.cik.replace(/^0+/, "")})` : ""}`}
          />
        </CardContent>
      </Card>
    );
  }

  const headline = buildCapitalPressureHeadline(data);
  const frameworkNote = buildFrameworkNote(data, {
    extractedData,
    capacityQuarters,
    derivedOfferingAbility,
  });
  const issuanceWindows = issuanceWindowSummary(data.recentIssuance);
  const utilization = issuanceUtilization(data);
  const criteriaVerified = data.criteriaVerified ?? 0;
  const criteriaTotal = data.criteriaTotal ?? 10;
  const criteriaPct = Math.round((criteriaVerified / criteriaTotal) * 100);

  const filterOptions = [
    ["all", "All"],
    ["issued", "Issued"],
    ["capacity", "Capacity"],
    ["needs_review", "Needs review"],
  ] as const;

  return (
    <Card className="p-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <CardContent className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {ticker} Capital Pressure
              </h2>
              <button
                type="button"
                onClick={copySummary}
                className="text-xs text-blue-600 dark:text-blue-400 underline shrink-0"
              >
                {copiedSummary ? "Copied" : "Copy summary"}
              </button>
            </div>
            {windowMeta && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{windowMeta}</p>
            )}
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-2 leading-snug">
              {headline}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Research signal — not a trade recommendation.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {data.score}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(data.status)}`}
              >
                {statusHeadlineLabel(data.status)}
              </span>
            </div>
            <Tooltip content="How many of the 10 score criteria had verified SEC evidence. Low coverage = treat the score as less certain.">
              <div className="flex items-center gap-2 cursor-help">
                <div className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                  <div
                    className="h-full bg-slate-600 dark:bg-slate-300"
                    style={{ width: `${criteriaPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-500">
                  {criteriaVerified}/{criteriaTotal} verified
                </span>
              </div>
            </Tooltip>
          </div>
        </div>

        {frameworkNote && (
          <div
            className={`text-sm rounded-lg px-3 py-2 border ${
              frameworkNote.tone === "warn"
                ? "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-100"
                : frameworkNote.tone === "ok"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-100"
                  : "bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/30 dark:border-sky-800 dark:text-sky-100"
            }`}
          >
            {frameworkNote.text}
          </div>
        )}

        {/* Issuance windows + utilization bar */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2 bg-gray-50/50 dark:bg-gray-900/30">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Recent issuance (verified windows)
          </h3>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {(
              [
                ["7d", issuanceWindows.d7],
                ["30d", issuanceWindows.d30],
                ["90d", issuanceWindows.d90],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-md bg-white dark:bg-gray-800 px-2 py-1.5 border border-gray-100 dark:border-gray-700">
                <div className="text-gray-500 font-medium">{label}</div>
                <div className="text-gray-800 dark:text-gray-200 mt-0.5 leading-tight">{value}</div>
              </div>
            ))}
          </div>
          {utilization && (
            <div className="space-y-1">
              <Tooltip
                content={`Registered shelf/ATM capacity used in the last 90 days. ${utilization.label}. Red dots below are individual filing events.`}
                side="top"
              >
                <button
                  type="button"
                  className="w-full text-left rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label={utilization.label}
                >
                  <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Capacity used (90d)
                  </p>
                  <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                    <div
                      className="h-full bg-red-500 dark:bg-red-400 transition-[width]"
                      style={{ width: `${Math.round(utilization.pct * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">
                    {utilization.label}
                  </p>
                </button>
              </Tooltip>
            </div>
          )}
          <EventSparkline events={events} />
        </div>

        {/* Pinned top driver */}
        {pinned ? (
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Top score driver
            </h3>
            <ul className="space-y-1">
              <TimelineRow event={pinned} highlighted />
            </ul>
          </div>
        ) : topReason ? (
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Top score driver
            </h3>
            <ReasonRow reason={topReason} />
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No automatic score reasons — expand full detail for data gaps.
          </p>
        )}

        {/* Accordion */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
          <div>
            <button
              type="button"
              onClick={() => togglePanel("timeline")}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-left text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900/40"
            >
              <Tooltip content={TIMELINE_LEGEND_TIP}>
                <span className="cursor-help">Full timeline ({filteredEvents.length})</span>
              </Tooltip>
              <span className="text-gray-400">{openPanel === "timeline" ? "−" : "+"}</span>
            </button>
            {openPanel === "timeline" && (
              <div className="px-3 pb-3 space-y-2">
                <select
                  value={timelineFilter}
                  onChange={(e) =>
                    setTimelineFilter(e.target.value as typeof timelineFilter)
                  }
                  className="w-full sm:hidden text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5"
                  aria-label="Filter timeline"
                >
                  {filterOptions.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <div className="hidden sm:flex flex-wrap gap-1.5">
                  {filterOptions.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTimelineFilter(key)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        timelineFilter === key
                          ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {filteredEvents.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {orderedEvents.length === 0
                      ? "No capital-structure events in the scanned window."
                      : "No events match this filter."}
                  </p>
                ) : (
                  <ul className="space-y-1 max-h-96 overflow-y-auto">
                    {filteredEvents.map((e) => (
                      <TimelineRow key={e.id} event={e} highlighted={pinned?.id === e.id} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => togglePanel("detail")}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-left text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900/40"
            >
              Supply fields, sub-scores &amp; data gaps
              <span className="text-gray-400">{openPanel === "detail" ? "−" : "+"}</span>
            </button>
            {openPanel === "detail" && (
              <div className="px-3 pb-3 space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">{data.summary}</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <SupplyField
                    title="Potential / registered capacity"
                    status={data.capacity?.status ?? "unknown"}
                    borderClass="border-sky-100 dark:border-sky-900/40 bg-sky-50/30 dark:bg-sky-950/20"
                  >
                    <p className="text-sm text-gray-800 dark:text-gray-200">
                      {data.capacity?.status === "unknown"
                        ? evidenceAvailabilityText("unknown")
                        : data.capacity?.description}
                    </p>
                    {data.capacity?.amountUsd != null && (
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Amount: {formatUsdShort(data.capacity.amountUsd)}
                      </p>
                    )}
                    <SecLink url={data.capacity?.evidence?.documentUrl} />
                  </SupplyField>

                  <SupplyField
                    title="Recently issued supply"
                    status={data.recentIssuance?.status ?? "unknown"}
                    statusLabel={issuanceFieldStatusLabel(data.recentIssuance)}
                    borderClass="border-red-100 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/20"
                  >
                    <div className="grid grid-cols-1 gap-0.5 text-xs">
                      <div>
                        <span className="text-gray-500">7d:</span> {issuanceWindows.d7}
                      </div>
                      <div>
                        <span className="text-gray-500">30d:</span> {issuanceWindows.d30}
                      </div>
                      <div>
                        <span className="text-gray-500">90d:</span> {issuanceWindows.d90}
                      </div>
                    </div>
                  </SupplyField>

                  <SupplyField
                    title="Current share count"
                    status={data.sharesOutstanding?.status ?? "unknown"}
                    borderClass="border-gray-200 dark:border-gray-700"
                  >
                    {data.sharesOutstanding?.status === "unknown" ||
                    data.sharesOutstanding?.value == null ? (
                      <p className="text-sm">{evidenceAvailabilityText("unknown")}</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium">
                          {formatSharesShort(data.sharesOutstanding.value)}
                        </p>
                        {data.sharesOutstanding.asOf && (
                          <p className="text-xs text-gray-500">As of {data.sharesOutstanding.asOf}</p>
                        )}
                        <SecLink url={data.sharesOutstanding.evidence?.documentUrl} label="XBRL / filing" />
                      </>
                    )}
                  </SupplyField>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Tooltip content="Financial need plus documented ability to access equity financing. Not a prediction of a future offering.">
                    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm cursor-help">
                      Dilution likelihood
                      <strong>{data.dilutionLikelihood}/10</strong>
                    </span>
                  </Tooltip>
                  <Tooltip content="Execution risk from splits, float/borrow gaps, catalysts, or droppiness. Not in Pump Scorecard overall score.">
                    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm cursor-help">
                      Short execution risk
                      <strong>{data.shortExecutionRisk}/10</strong>
                    </span>
                  </Tooltip>
                </div>

                {data.edgarSearchUrl && (
                  <p className="text-xs text-gray-500">
                    Manual check:{" "}
                    <SecLink url={data.edgarSearchUrl} label="EDGAR company filings" />
                  </p>
                )}

                {otherReasons.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-gray-500 mb-2">
                      Other score reasons
                    </h4>
                    {otherReasons.map((r, i) => (
                      <ReasonRow key={`${r.label}-${i}`} reason={r} />
                    ))}
                  </div>
                )}

                {data.unknowns && data.unknowns.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-gray-500 mb-1">
                      Data gaps
                    </h4>
                    <ul className="list-disc list-inside text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                      {data.unknowns.map((u) => (
                        <li key={u}>{u}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SupplyField({
  title,
  status,
  statusLabel,
  borderClass,
  children,
}: {
  title: string;
  status: EvidenceStatus;
  statusLabel?: string;
  borderClass: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 space-y-1 ${borderClass}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${evidenceStatusClass(status)}`}>
          {statusLabel ?? evidenceAvailabilityText(status, "field")}
        </span>
      </div>
      {children}
    </div>
  );
}
