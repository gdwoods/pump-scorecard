"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { cleanFilingText } from "@/lib/capitalPressure/textClean";
import type {
  CapitalEvent,
  CapitalPressureResult,
  EvidenceStatus,
  RecentIssuanceField,
  ScoreReason,
} from "@/lib/capitalPressure/types";

const NEEDS_REVIEW_TIP =
  "Matched a financing-related phrase, but not auto-scored — verify the linked filing.";

function statusBadgeLabel(status: CapitalPressureResult["status"]): string {
  switch (status) {
    case "high":
      return "High";
    case "elevated":
      return "Elevated";
    case "watch":
      return "Watch";
    default:
      return "Low";
  }
}

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

function evidenceStatusLabel(status: EvidenceStatus): string {
  switch (status) {
    case "reported":
      return "Reported";
    case "partial":
      return "Partial";
    case "not_applicable":
      return "N/A";
    default:
      return "Unknown";
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

function formatShares(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return "Not verified from available filings";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatUsd(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return "Not verified from available filings";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function eventTypeLabel(type: CapitalEvent["type"]): string {
  return type.replace(/_/g, " ");
}

function isIssuanceEvent(event: CapitalEvent): boolean {
  if (event.isCapacityOnly === true) return false;
  return [
    "registered_direct",
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

/** Format one 7/30/90 window without implying zero issuance. */
function formatIssuanceWindow(
  shares?: number | null,
  proceeds?: number | null
): string {
  const hasShares = shares != null && Number.isFinite(shares);
  const hasProceeds = proceeds != null && Number.isFinite(proceeds);
  if (hasShares && hasProceeds) {
    return `${formatShares(shares)} / ${formatUsd(proceeds)}`;
  }
  if (hasShares) return formatShares(shares);
  if (hasProceeds) return `No share count verified · ${formatUsd(proceeds)} proceeds`;
  return "No share count verified";
}

function formatRecentIssuanceList(ri: RecentIssuanceField) {
  return (
    <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
      <li>
        <span className="text-gray-500">7d:</span>{" "}
        {formatIssuanceWindow(ri.shares7d, ri.proceeds7dUsd)}
      </li>
      <li>
        <span className="text-gray-500">30d:</span>{" "}
        {formatIssuanceWindow(ri.shares30d, ri.proceeds30dUsd)}
      </li>
      <li>
        <span className="text-gray-500">90d:</span>{" "}
        {formatIssuanceWindow(ri.shares90d, ri.proceeds90dUsd)}
      </li>
    </ul>
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
        ? "border-slate-200 dark:border-slate-600 opacity-90"
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
            Top score driver
          </span>
        )}
        <span className="font-medium text-gray-800 dark:text-gray-200">{event.eventDate}</span>
        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 uppercase tracking-wide">
          {eventTypeLabel(event.type)}
        </span>
        {capacity && (
          <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-100 dark:border-sky-800">
            capacity
          </span>
        )}
        {issued && (
          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 font-medium">
            issued
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
      <p className="text-xs text-gray-600 dark:text-gray-400">
        {description || excerpt}
      </p>
      <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
        {event.sharesIssued != null && Number.isFinite(event.sharesIssued) && (
          <span>Issued: {formatShares(event.sharesIssued)}</span>
        )}
        {event.potentialShares != null && Number.isFinite(event.potentialShares) && (
          <span>Potential: {formatShares(event.potentialShares)}</span>
        )}
        {event.grossProceedsUsd != null && Number.isFinite(event.grossProceedsUsd) && (
          <span>Amount: {formatUsd(event.grossProceedsUsd)}</span>
        )}
        <SecLink url={evidence?.documentUrl} label={evidence?.form} />
        {(event.filedAt || event.verifiedAt) && (
          <span>
            filed {event.filedAt || evidence?.filingDate}
            {event.verifiedAt ? ` · verified ${event.verifiedAt.slice(0, 10)}` : ""}
          </span>
        )}
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
      <SecLink
        url={reason.evidence?.documentUrl}
        label={`${reason.evidence?.form ?? "SEC"} evidence`}
      />
    </div>
  );
}

function findPinnedEvent(
  events: CapitalEvent[],
  topReason?: ScoreReason
): CapitalEvent | undefined {
  if (!topReason?.evidence) return undefined;
  const acc = topReason.evidence.accessionNumber;
  const url = topReason.evidence.documentUrl;
  const form = topReason.evidence.form;
  const date = topReason.evidence.filingDate;

  return (
    events.find(
      (e) =>
        (acc && e.evidence?.accessionNumber === acc) ||
        (url && e.evidence?.documentUrl === url)
    ) ||
    events.find(
      (e) => e.evidence?.form === form && e.evidence?.filingDate === date
    )
  );
}

export default function CapitalPressureCard({
  ticker,
  data,
}: {
  ticker: string;
  data?: CapitalPressureResult | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<
    "all" | "issued" | "capacity" | "needs_review"
  >("all");
  const [copiedReason, setCopiedReason] = useState(false);

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
      if (timelineFilter === "needs_review")
        return e.evidence?.confidence === "needs_review" || e.scoreEligible === false;
      return true;
    });
  }, [orderedEvents, timelineFilter]);

  const copyTopReason = async () => {
    if (!topReason) return;
    const excerpt = cleanFilingText(topReason.evidence?.excerpt || "");
    const lines = [
      `${ticker} Capital Pressure — top reason (+${topReason.points})`,
      topReason.label,
      excerpt,
      topReason.evidence?.documentUrl || "",
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopiedReason(true);
      setTimeout(() => setCopiedReason(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (!data) return null;

  const windowLabel =
    data.windowStart && data.windowEnd
      ? `Window: ${data.windowStart} → ${data.windowEnd}`
      : null;
  const filingsScanned =
    data.filingsScanned != null
      ? `${data.filingsScanned} filing${data.filingsScanned === 1 ? "" : "s"} scanned`
      : null;
  const eventCount = events.length;
  const criteriaLabel =
    data.criteriaTotal != null
      ? `${data.criteriaVerified ?? 0}/${data.criteriaTotal} criteria verified`
      : null;
  const windowMeta = [
    windowLabel,
    data.registrationWindowStart && data.registrationWindowStart !== data.windowStart
      ? `registrations to ${data.registrationWindowStart}`
      : null,
    filingsScanned,
    eventCount > 0 ? `${eventCount} event${eventCount === 1 ? "" : "s"}` : null,
    data.latestVerifiedAt ? `Verified ${data.latestVerifiedAt.slice(0, 10)}` : null,
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
            Capital pressure unavailable —{" "}
            {data.unavailableReason || "SEC filings could not be verified"}. Missing data is
            not a risk signal.
          </p>
          <p className="text-xs text-gray-500">Scanned: {data.scannedThrough}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Please manually check{" "}
            <a
              href={
                data.edgarSearchUrl ||
                "https://www.sec.gov/edgar/searchedgar/companysearch.html"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline"
            >
              EDGAR{data.cik ? ` (CIK ${data.cik.replace(/^0+/, "")})` : ""}
            </a>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  const compactEventCount = 3;
  const visibleEvents = showAllEvents
    ? filteredEvents
    : expanded
      ? filteredEvents.slice(0, 6)
      : filteredEvents.slice(0, compactEventCount);

  const capacityText =
    !data.capacity || data.capacity.status === "unknown"
      ? "Not verified from available filings"
      : data.capacity.description;

  const criteriaVerified = data.criteriaVerified ?? 0;
  const criteriaTotal = data.criteriaTotal ?? 10;
  const criteriaPct = Math.round((criteriaVerified / criteriaTotal) * 100);

  return (
    <Card className="p-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <CardContent className="space-y-4">
        {/* Header: score, short status, window */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {ticker} Capital Pressure
            </h2>
            {windowMeta && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{windowMeta}</p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Research signal — not a trade recommendation. Dilution is not certain.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {data.score}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(data.status)}`}
              >
                {statusBadgeLabel(data.status)}
              </span>
            </div>
            <Tooltip content="How many of the 10 Capital Pressure score criteria had verified SEC evidence. Lower coverage means more unknowns — treat the score as less certain.">
              <div className="flex items-center gap-2 cursor-help">
                <div className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                  <div
                    className="h-full bg-slate-600 dark:bg-slate-300"
                    style={{ width: `${criteriaPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-500">{criteriaLabel}</span>
              </div>
            </Tooltip>
          </div>
        </div>

        <p className="text-sm text-gray-700 dark:text-gray-300">{data.summary}</p>

        {/* Compact: top reason always visible */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Strongest score reason
            </h3>
            {topReason && (
              <button
                type="button"
                onClick={copyTopReason}
                className="text-xs text-blue-600 dark:text-blue-400 underline"
              >
                {copiedReason ? "Copied" : "Copy reason + SEC link"}
              </button>
            )}
          </div>
          {topReason ? (
            <ReasonRow reason={topReason} />
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No automatic score reasons — unverified criteria are listed under details.
            </p>
          )}
        </div>

        {/* Compact timeline: 3 newest (pinned first), legend + filters */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">
            Supply &amp; financing timeline
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
            <span className="text-red-700 dark:text-red-300 font-medium">Issued</span> = shares
            sold ·{" "}
            <span className="text-sky-700 dark:text-sky-300 font-medium">Capacity</span> =
            registered or contractual ability · Needs review = matched phrase, not auto-scored
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(
              [
                ["all", "All"],
                ["issued", "Issued"],
                ["capacity", "Capacity"],
                ["needs_review", "Needs review"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTimelineFilter(key);
                  setShowAllEvents(false);
                }}
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
                ? "No capital-structure events verified in the scanned filing window."
                : "No events match this filter."}
            </p>
          ) : (
            <>
              <ul className="space-y-1">
                {visibleEvents.map((e) => (
                  <TimelineRow
                    key={e.id}
                    event={e}
                    highlighted={pinned?.id === e.id}
                  />
                ))}
              </ul>
              {(expanded || showAllEvents) && filteredEvents.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllEvents((v) => !v)}
                  className="mt-2 text-xs text-blue-600 dark:text-blue-400 underline"
                >
                  {showAllEvents
                    ? "Show fewer events"
                    : `All events (${filteredEvents.length})`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Expand denser sections */}
        <button
          type="button"
          onClick={() => {
            setExpanded((v) => {
              if (v) {
                setShowAllEvents(false);
                setShowDetails(false);
              }
              return !v;
            });
          }}
          className="text-xs font-medium text-blue-600 dark:text-blue-400 underline"
        >
          {expanded
            ? "Show less"
            : "Show supply fields, sub-scores, full timeline & data gaps"}
        </button>

        {expanded && (
          <div className="space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
            {/* Three supply fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-sky-100 dark:border-sky-900/40 bg-sky-50/30 dark:bg-sky-950/20 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Potential / registered capacity
                  </h3>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${evidenceStatusClass(
                      data.capacity?.status ?? "unknown"
                    )}`}
                  >
                    {evidenceStatusLabel(data.capacity?.status ?? "unknown")}
                  </span>
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200">{capacityText}</p>
                {data.capacity?.amountUsd != null &&
                  Number.isFinite(data.capacity.amountUsd) && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Amount: {formatUsd(data.capacity.amountUsd)}
                    </p>
                  )}
                {data.capacity?.potentialShares != null &&
                  Number.isFinite(data.capacity.potentialShares) && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Potential shares: {formatShares(data.capacity.potentialShares)}
                    </p>
                  )}
                <SecLink url={data.capacity?.evidence?.documentUrl} />
              </div>

              <div className="rounded-lg border border-red-100 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/20 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Recently issued supply
                  </h3>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${evidenceStatusClass(
                      data.recentIssuance?.status ?? "unknown"
                    )}`}
                  >
                    {evidenceStatusLabel(data.recentIssuance?.status ?? "unknown")}
                  </span>
                </div>
                {!data.recentIssuance || data.recentIssuance.status === "unknown" ? (
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    Not verified from available filings
                  </p>
                ) : (
                  formatRecentIssuanceList(data.recentIssuance)
                )}
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Current share count
                  </h3>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${evidenceStatusClass(
                      data.sharesOutstanding?.status ?? "unknown"
                    )}`}
                  >
                    {evidenceStatusLabel(data.sharesOutstanding?.status ?? "unknown")}
                  </span>
                </div>
                {!data.sharesOutstanding ||
                data.sharesOutstanding.status === "unknown" ||
                data.sharesOutstanding.value == null ||
                !Number.isFinite(data.sharesOutstanding.value) ? (
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    Not verified from available filings
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-gray-800 dark:text-gray-200">
                      {formatShares(data.sharesOutstanding.value)}
                    </p>
                    {data.sharesOutstanding.asOf && (
                      <p className="text-xs text-gray-500">
                        As of {data.sharesOutstanding.asOf}
                      </p>
                    )}
                    <SecLink
                      url={data.sharesOutstanding.evidence?.documentUrl}
                      label="XBRL / filing"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Sub-scores */}
            <div className="flex flex-wrap gap-3">
              <Tooltip content="Financial need plus documented ability to access equity or common-equivalent financing. Scaled from the Capital Pressure score; not a prediction of a future offering.">
                <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm cursor-help">
                  Dilution likelihood
                  <strong>{data.dilutionLikelihood}/10</strong>
                </span>
              </Tooltip>
              <Tooltip content="Execution risk, not a bullish signal. Adds points for reverse splits, missing float/borrow, high-impact news catalysts, or Droppiness spikes that hold. Not included in the Pump Scorecard overall score.">
                <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm cursor-help">
                  Short execution risk
                  <strong>{data.shortExecutionRisk}/10</strong>
                </span>
              </Tooltip>
            </div>

            {data.edgarSearchUrl && (
              <p className="text-xs text-gray-500">
                Manual check:{" "}
                <a
                  href={data.edgarSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  EDGAR company filings
                  {data.cik ? ` (CIK ${data.cik.replace(/^0+/, "")})` : ""}
                </a>
              </p>
            )}

            {/* Remaining reasons + gaps */}
            <div>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="text-xs text-blue-600 dark:text-blue-400 underline"
              >
                {showDetails
                  ? "Hide remaining reasons & data gaps"
                  : "Show remaining reasons & data gaps"}
              </button>
              {showDetails && (
                <div className="mt-2 space-y-2">
                  {otherReasons.map((r, i) => (
                    <ReasonRow key={`${r.label}-${i}`} reason={r} />
                  ))}
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
        )}
      </CardContent>
    </Card>
  );
}
