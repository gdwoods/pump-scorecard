"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import type { FastVerdictKind } from "@/lib/fast/types";
import type {
  DilutionBrief as DilutionBriefModel,
  DilutionPillar,
  DilutionPillTone,
} from "@/lib/dilution/types";

const TRADE_GATE_BADGE: Record<FastVerdictKind, string> = {
  NO_TRADE: "bg-red-600 text-white",
  WATCH: "bg-amber-500 text-white",
  REVIEW: "bg-sky-600 text-white",
};

const PILL_CLASS: Record<DilutionPillTone, string> = {
  ok: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  risk: "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
  muted: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

const OVERALL_CLASS: Record<DilutionPillTone, string> = {
  ok: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
  info: "bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800",
  warn: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
  risk: "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800",
  muted: "bg-gray-50 border-gray-200 dark:bg-gray-900/40 dark:border-gray-700",
};

const PILLAR_CHROME: Record<
  DilutionPillar["id"],
  { border: string; header: string; footer: string }
> = {
  need: {
    border: "border-rose-200 dark:border-rose-800",
    header: "text-rose-700 dark:text-rose-300",
    footer: "bg-rose-50/80 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900",
  },
  ability: {
    border: "border-sky-200 dark:border-sky-800",
    header: "text-sky-700 dark:text-sky-300",
    footer: "bg-sky-50/80 dark:bg-sky-950/30 border-sky-100 dark:border-sky-900",
  },
  incentive: {
    border: "border-violet-200 dark:border-violet-800",
    header: "text-violet-700 dark:text-violet-300",
    footer: "bg-violet-50/80 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900",
  },
};

function AsOf({ value }: { value?: string | null }) {
  if (!value) return null;
  return <span className="text-[10px] text-gray-500 dark:text-gray-400"> · {value}</span>;
}

export default function DilutionBrief({ brief }: { brief: DilutionBriefModel }) {
  return (
    <Card
      className="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
      data-testid="dilution-brief"
    >
      <CardContent className="p-5 md:p-6 space-y-5">
        <header className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Dilution brief · financing assessment
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{brief.ticker}</h2>
                {brief.tradeGate && (
                  <Tooltip
                    content="Fast Verdict trade gate (NO TRADE / WATCH / REVIEW). Separate from the dilution letter grade."
                    side="bottom"
                  >
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold cursor-help ${TRADE_GATE_BADGE[brief.tradeGate.verdict]}`}
                    >
                      Trade gate · {brief.tradeGate.label}
                    </span>
                  </Tooltip>
                )}
                {brief.session && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Session {brief.session}
                  </span>
                )}
              </div>
            </div>
            <div
              className={`rounded-xl border px-3 py-2 text-right shrink-0 ${OVERALL_CLASS[brief.overall.tone]}`}
            >
              <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Dilution support
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {brief.overall.letter} · {brief.overall.label}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{brief.overall.caption}</p>
            </div>
          </div>

          {brief.pills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {brief.pills.map((pill) => (
                <span
                  key={pill.id}
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${PILL_CLASS[pill.tone]}`}
                >
                  {pill.label}
                  {pill.asOf ? ` · ${pill.asOf}` : ""}
                </span>
              ))}
            </div>
          )}
        </header>

        <section
          aria-label="10-second read"
          className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/20 px-4 py-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300 mb-1">
            10-second read
          </p>
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{brief.tenSecondRead}</p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {brief.pillars.map((pillar) => {
            const chrome = PILLAR_CHROME[pillar.id];
            return (
              <article
                key={pillar.id}
                aria-label={pillar.title}
                className={`rounded-xl border ${chrome.border} bg-white dark:bg-gray-900/40 overflow-hidden flex flex-col`}
              >
                <div className="px-4 pt-3 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className={`text-sm font-bold uppercase tracking-wide ${chrome.header}`}>
                        {pillar.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{pillar.question}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {pillar.scoreLabel}
                    </span>
                  </div>
                </div>
                <dl className="px-4 pb-3 space-y-1.5 text-sm flex-1">
                  {pillar.rows.map((row) => (
                    <div key={`${pillar.id}-${row.label}`} className="flex justify-between gap-3">
                      <dt className="text-gray-500 dark:text-gray-400 shrink-0">{row.label}</dt>
                      <dd className="text-right text-gray-900 dark:text-gray-100">
                        {row.value}
                        <AsOf value={row.asOf} />
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className={`mt-auto px-4 py-2.5 border-t text-xs ${chrome.footer}`}>
                  <p className="font-semibold uppercase tracking-wide mb-0.5">Bottom line</p>
                  <p className="text-gray-700 dark:text-gray-300">{pillar.bottomLine}</p>
                </div>
              </article>
            );
          })}
        </div>

        <section
          aria-label="Key dilution weapon"
          className="rounded-xl border border-sky-200 dark:border-sky-800 px-4 py-4 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
              Key dilution / main weapon
            </h3>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${PILL_CLASS.warn}`}>
              {brief.weapon.badge}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{brief.weapon.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{brief.weapon.heroLabel}</p>
            </div>
            <p className="text-2xl font-bold text-sky-700 dark:text-sky-300">
              {brief.weapon.heroValue}
              {brief.weapon.heroAsOf && (
                <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">
                  as of {brief.weapon.heroAsOf}
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Why it matters
            </p>
            <p className="text-sm text-gray-800 dark:text-gray-200">{brief.weapon.whyItMatters}</p>
          </div>
          {brief.weapon.caveat && (
            <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
              {brief.weapon.caveat}
            </p>
          )}
        </section>

        <section aria-label="Final read" className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Final read
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            {brief.finalRead.map((cell) => (
              <div
                key={cell.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-2"
              >
                <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {cell.label}
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{cell.value}</p>
                {cell.detail && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">{cell.detail}</p>
                )}
              </div>
            ))}
            <div className={`rounded-lg border px-3 py-2 ${OVERALL_CLASS[brief.overall.tone]}`}>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Overall
              </p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {brief.overall.letter} · {brief.overall.label}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{brief.overall.caption}</p>
            </div>
          </div>
        </section>

        <details className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
            Sources / as-of {brief.sources.length ? `(${brief.sources.length})` : ""}
          </summary>
          {brief.sources.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              No dated SEC links collected yet — check Capital Pressure below.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {brief.sources.map((src) => (
                <li key={src.url}>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700"
                  >
                    {src.label}
                  </a>
                  {src.asOf && (
                    <span className="text-xs text-gray-500 dark:text-gray-400"> · {src.asOf}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
      </CardContent>
    </Card>
  );
}
