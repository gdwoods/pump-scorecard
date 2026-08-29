"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { droppinessTailwindClass } from "@/lib/droppiness/colors";
import {
  describeFastWalkAwayFlag,
  describeFastWalkAwayReason,
} from "@/lib/fast/walkAwayReasons";
import type { FastVerdict, FastVerdictKind } from "@/lib/fast/types";
import { T } from "@/lib/config/thresholds";

function pct(n: number | null, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "n/a";
  return `${(n * 100).toFixed(digits)}%`;
}

function num(n: number | null, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "n/a";
  return n.toFixed(digits);
}

const VERDICT_STYLES: Record<
  FastVerdictKind,
  { badge: string; panel: string; label: string; blurb: string }
> = {
  NO_TRADE: {
    badge: "bg-red-600 text-white",
    panel: "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40",
    label: "NO TRADE",
    blurb: "Hard walk-away on this screen — do not size a short here.",
  },
  WATCH: {
    badge: "bg-amber-500 text-white",
    panel: "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40",
    label: "WATCH",
    blurb: "Incomplete or soft signal — wait; do not treat as a setup.",
  },
  REVIEW: {
    badge: "bg-sky-600 text-white",
    panel: "border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40",
    label: "REVIEW",
    blurb: "Not obviously disqualified — escalate to full Short Check / Tier 3.",
  },
};

const VERDICT_TOOLTIPS: Record<FastVerdictKind, string> = {
  NO_TRADE: "A Framework hard walk-away rule fired (W3–W10). Treat as disqualifying on the fast screen.",
  WATCH: "Data quality too low (W1) or too many soft flags — wait for better inputs.",
  REVIEW: "No hard walk-away — ticker may warrant deeper Short Check research.",
};

function RuleCodeBadge({ reason }: { reason: string }) {
  const description = describeFastWalkAwayReason(reason);
  const badge = (
    <span className="text-sm font-mono text-gray-700 dark:text-gray-300 underline decoration-dotted cursor-help">
      {reason}
    </span>
  );
  if (!description) return badge;
  return (
    <Tooltip content={description} side="bottom">
      {badge}
    </Tooltip>
  );
}

export default function FastVerdictCard({
  verdict,
  loading,
  error,
}: {
  verdict: FastVerdict | null;
  loading?: boolean;
  error?: string | null;
}) {
  if (loading) {
    return (
      <Card className="p-6 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl">
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Running fast verdict…
        </p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-4 border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
        <p className="text-sm text-yellow-800 dark:text-yellow-300">
          Fast verdict unavailable: {error}
        </p>
      </Card>
    );
  }

  if (!verdict) return null;

  const style = VERDICT_STYLES[verdict.verdict] ?? VERDICT_STYLES.WATCH;
  const sourcesOk = Math.round(verdict.dataCompleteness * 8);
  const moveBelowPumpThreshold =
    verdict.price.todayMovePct == null ||
    verdict.price.todayMovePct < T.todayMove.min;
  const highBorrowFee =
    verdict.borrow.feePct != null && verdict.borrow.feePct >= 50;

  return (
    <Card className={`shadow-md border rounded-xl overflow-hidden ${style.panel}`}>
      <CardContent className="p-5 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Fast verdict · Framework 3.0
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {verdict.ticker}
              </span>
              <Tooltip content={VERDICT_TOOLTIPS[verdict.verdict]} side="bottom">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-semibold cursor-help ${style.badge}`}
                >
                  {style.label}
                </span>
              </Tooltip>
              {verdict.reason && <RuleCodeBadge reason={verdict.reason} />}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{style.blurb}</p>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 sm:text-right shrink-0">
            <div>{verdict.elapsedMs}ms · data {sourcesOk}/8</div>
            <div>session {verdict.session}</div>
            <a
              href={`/api/fast/${encodeURIComponent(verdict.ticker)}?fmt=text`}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-blue-600 dark:hover:text-blue-400"
            >
              raw text
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-800 dark:text-gray-200">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Move </span>
            <span className={moveBelowPumpThreshold ? "text-amber-600 dark:text-amber-400" : ""}>
              {pct(verdict.price.todayMovePct)} today · vol {num(verdict.price.volVs20d, 1)}×
            </span>
            {moveBelowPumpThreshold && (
              <Tooltip
                content={describeFastWalkAwayReason("W2:todayMove") ?? ""}
                side="bottom"
              >
                <span className="ml-1 text-xs text-amber-600 dark:text-amber-400 underline decoration-dotted cursor-help">
                  (below {Math.round(T.todayMove.min * 100)}% discretionary)
                </span>
              </Tooltip>
            )}
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Runner </span>
            {verdict.runner.class} · prior {pct(verdict.runner.priorDayPct)}
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Drop </span>
            {verdict.droppiness.status === "UNVERIFIED" ? (
              <span className="text-gray-500 dark:text-gray-400">
                UNVERIFIED ({verdict.droppiness.reason ?? "not_cached"})
              </span>
            ) : (
              <span className={droppinessTailwindClass(verdict.droppiness.score)}>
                {verdict.droppiness.score ?? "n/a"} ({verdict.droppiness.spikeCount ?? "?"} spikes)
              </span>
            )}
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">News </span>
            {verdict.news.class}
            {verdict.news.headline
              ? ` — ${verdict.news.headline.slice(0, 60)}${verdict.news.headline.length > 60 ? "…" : ""}`
              : ""}
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Borrow </span>
            {verdict.borrow.available == null
              ? "unknown"
              : verdict.borrow.available
                ? "available"
                : "UNAVAILABLE"}
            {verdict.borrow.feePct != null && (
              <span className={highBorrowFee ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                {` · ${verdict.borrow.feePct}% fee`}
              </span>
            )}
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Dilute </span>
            {verdict.dilution.derivedOfferingAbility}
            {verdict.dilution.capacityQuarters != null
              ? ` · ${num(verdict.dilution.capacityQuarters, 2)} qtrs capacity`
              : ""}
          </div>
        </div>

        {(verdict.flags.length > 0 || verdict.unavailable.length > 0) && (
          <div className="pt-2 border-t border-black/5 dark:border-white/10 text-xs space-y-1">
            {verdict.flags.length > 0 && (
              <div>
                <span className="font-semibold">Flags:</span>{" "}
                <ul className="mt-1 space-y-1 list-none">
                  {verdict.flags.map((flag, i) => {
                    const tip = describeFastWalkAwayFlag(flag);
                    return (
                      <li key={i} className="text-gray-700 dark:text-gray-300">
                        {tip ? (
                          <Tooltip content={tip} side="bottom">
                            <span className="underline decoration-dotted cursor-help">{flag}</span>
                          </Tooltip>
                        ) : (
                          flag
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {verdict.unavailable.length > 0 && (
              <p>
                <span className="font-semibold">Missing:</span>{" "}
                {verdict.unavailable.join(", ")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
