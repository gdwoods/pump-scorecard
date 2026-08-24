"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import type {
  CapitalEvent,
  CapitalPressureResult,
  EvidenceStatus,
  ScoreReason,
} from "@/lib/capitalPressure/types";

function statusLabel(status: CapitalPressureResult["status"]): string {
  switch (status) {
    case "high":
      return "High capital pressure";
    case "elevated":
      return "Elevated";
    case "watch":
      return "Watch";
    default:
      return "Low documented dilution pressure";
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

function TimelineRow({ event }: { event: CapitalEvent }) {
  const evidence = event.evidence;
  return (
    <li className="border-l-2 border-slate-200 dark:border-slate-600 pl-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="font-medium text-gray-800 dark:text-gray-200">{event.eventDate}</span>
        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 uppercase tracking-wide">
          {eventTypeLabel(event.type)}
        </span>
        {event.isCapacityOnly && (
          <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
            capacity
          </span>
        )}
        {evidence?.confidence === "needs_review" && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            needs review
          </span>
        )}
      </div>
      <p className="text-sm text-gray-800 dark:text-gray-200">{event.title}</p>
      <p className="text-xs text-gray-600 dark:text-gray-400">{event.description}</p>
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
      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3">{reason.evidence?.excerpt ?? ''}</p>
      <SecLink url={reason.evidence?.documentUrl} label={`${reason.evidence?.form ?? 'SEC'} evidence`} />
    </div>
  );
}

export default function CapitalPressureCard({
  ticker,
  data,
}: {
  ticker: string;
  data?: CapitalPressureResult | null;
}) {
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  if (!data) return null;

  if (!data.available) {
    return (
      <Card className="p-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <CardContent className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {ticker} Capital Pressure
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Capital pressure unavailable — {data.unavailableReason || "SEC filings could not be verified"}.
            Missing data is not a risk signal.
          </p>
          <p className="text-xs text-gray-500">Scanned: {data.scannedThrough}</p>
        </CardContent>
      </Card>
    );
  }

  const events = data.events || [];
  const visibleEvents = showAllEvents ? events : events.slice(0, 6);
  const topReason = data.reasons?.[0];
  const otherReasons = (data.reasons || []).slice(1);

  const capacityText =
    !data.capacity || data.capacity.status === "unknown"
      ? "Not verified from available filings"
      : data.capacity.description;

  return (
    <Card className="p-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {ticker} Capital Pressure
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Research signal for Short Check — not a trade recommendation. Dilution is not certain.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{data.score}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(data.status)}`}
            >
              {statusLabel(data.status)}
            </span>
          </div>
        </div>

        <p className="text-sm text-gray-700 dark:text-gray-300">{data.summary}</p>
        {data.latestVerifiedAt && (
          <p className="text-xs text-gray-500">
            Latest verified: {data.latestVerifiedAt.slice(0, 10)}
            {data.windowStart && data.windowEnd
              ? ` · Window ${data.windowStart} → ${data.windowEnd}`
              : ""}
          </p>
        )}

        {/* Three supply fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Potential / registered capacity
              </h3>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${evidenceStatusClass(data.capacity?.status ?? "unknown")}`}>
                {evidenceStatusLabel(data.capacity?.status ?? "unknown")}
              </span>
            </div>
            <p className="text-sm text-gray-800 dark:text-gray-200">{capacityText}</p>
            {data.capacity?.amountUsd != null && Number.isFinite(data.capacity.amountUsd) && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Amount: {formatUsd(data.capacity.amountUsd)}
              </p>
            )}
            {data.capacity?.potentialShares != null && Number.isFinite(data.capacity.potentialShares) && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Potential shares: {formatShares(data.capacity.potentialShares)}
              </p>
            )}
            <SecLink url={data.capacity?.evidence?.documentUrl} />
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Recently issued supply
              </h3>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${evidenceStatusClass(data.recentIssuance?.status ?? "unknown")}`}>
                {evidenceStatusLabel(data.recentIssuance?.status ?? "unknown")}
              </span>
            </div>
            {!data.recentIssuance || data.recentIssuance.status === "unknown" ? (
              <p className="text-sm text-gray-800 dark:text-gray-200">
                Not verified from available filings
              </p>
            ) : (
              <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
                <li>
                  7d:{" "}
                  {data.recentIssuance.shares7d != null && Number.isFinite(data.recentIssuance.shares7d)
                    ? formatShares(data.recentIssuance.shares7d)
                    : "—"}
                  {data.recentIssuance.proceeds7dUsd != null && Number.isFinite(data.recentIssuance.proceeds7dUsd)
                    ? ` / ${formatUsd(data.recentIssuance.proceeds7dUsd)}`
                    : ""}
                </li>
                <li>
                  30d:{" "}
                  {data.recentIssuance.shares30d != null && Number.isFinite(data.recentIssuance.shares30d)
                    ? formatShares(data.recentIssuance.shares30d)
                    : "—"}
                  {data.recentIssuance.proceeds30dUsd != null && Number.isFinite(data.recentIssuance.proceeds30dUsd)
                    ? ` / ${formatUsd(data.recentIssuance.proceeds30dUsd)}`
                    : ""}
                </li>
                <li>
                  90d:{" "}
                  {data.recentIssuance.shares90d != null && Number.isFinite(data.recentIssuance.shares90d)
                    ? formatShares(data.recentIssuance.shares90d)
                    : "—"}
                  {data.recentIssuance.proceeds90dUsd != null && Number.isFinite(data.recentIssuance.proceeds90dUsd)
                    ? ` / ${formatUsd(data.recentIssuance.proceeds90dUsd)}`
                    : ""}
                </li>
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Current share count
              </h3>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${evidenceStatusClass(data.sharesOutstanding?.status ?? "unknown")}`}>
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
                  <p className="text-xs text-gray-500">As of {data.sharesOutstanding.asOf}</p>
                )}
                <SecLink url={data.sharesOutstanding.evidence?.documentUrl} label="XBRL / filing" />
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

        {/* Timeline */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
            Supply &amp; financing timeline
          </h3>
          {events.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No capital-structure events verified in the scanned filing window.
            </p>
          ) : (
            <>
              <ul className="space-y-1">{visibleEvents.map((e) => (
                <TimelineRow key={e.id} event={e} />
              ))}</ul>
              {events.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllEvents((v) => !v)}
                  className="mt-2 text-xs text-blue-600 dark:text-blue-400 underline"
                >
                  {showAllEvents ? "Show fewer events" : `All events (${events.length})`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Details: strongest reason + expander */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
            Score details
          </h3>
          {topReason ? (
            <ReasonRow reason={topReason} />
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No automatic score reasons — unverified criteria are listed as data gaps.
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs text-blue-600 dark:text-blue-400 underline"
          >
            {showDetails ? "Hide details" : "Show remaining reasons & data gaps"}
          </button>
          {showDetails && (
            <div className="mt-2 space-y-2">
              {otherReasons.map((r, i) => (
                <ReasonRow key={`${r.label}-${i}`} reason={r} />
              ))}
              {data.unknowns && data.unknowns.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-gray-500 mb-1">Data gaps</h4>
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
      </CardContent>
    </Card>
  );
}
