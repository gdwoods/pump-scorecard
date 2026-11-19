"use client";

import type { RegShoShortVolumeReport } from "@/lib/fast/regShoShortVolume";

function formatShares(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatRatio(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export default function RegShoShortVolumeCard({
  ticker,
  report,
  loading,
  error,
}: {
  ticker: string;
  report: RegShoShortVolumeReport | null;
  loading?: boolean;
  error?: string | null;
}) {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return null;

  const unavailable = Boolean(error) || report?.status === "unavailable";
  const empty =
    report?.status === "empty" || (report?.status === "ok" && report.recentDays.length === 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mt-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {symbol} FINRA Daily Short Volume
        </h3>
        {report?.sourceUrl && (
          <a
            href={report.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-500 dark:text-gray-400 underline hover:text-blue-600 dark:hover:text-blue-400"
          >
            FINRA daily short-sale volume
          </a>
        )}
      </div>

      {loading && !report ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading recent TRF short volume…</p>
      ) : unavailable ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          FINRA short volume is unavailable{error ? `: ${error}` : ""}.
        </p>
      ) : empty ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No FINRA TRF short-sale prints in the recent window.
        </p>
      ) : report ? (
        <>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Recent Combined Days
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="py-2 pr-3 font-semibold">Trade date</th>
                  <th className="py-2 pr-3 font-semibold text-right">Short shares</th>
                  <th className="py-2 pr-3 font-semibold text-right">Short-exempt</th>
                  <th className="py-2 pr-3 font-semibold text-right">Total shares</th>
                  <th className="py-2 font-semibold text-right">Short %</th>
                </tr>
              </thead>
              <tbody>
                {report.recentDays.map((day) => {
                  const latest = day.tradeDate === report.latest?.tradeDate;
                  return (
                    <tr
                      key={day.tradeDate}
                      className={`border-b border-gray-100 dark:border-gray-700/60 ${
                        latest
                          ? "font-semibold text-gray-900 dark:text-gray-100"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <td className="py-2 pr-3 whitespace-nowrap">{day.tradeDate}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatShares(day.shortShares)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatShares(day.shortExemptShares)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatShares(day.totalShares)}</td>
                      <td className="py-2 text-right tabular-nums">{formatRatio(day.shortRatio)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Combined across FINRA trade-reporting facilities (Nasdaq TRF, NYSE TRF, and Nasdaq Chicago TRF).
            Short shares include short-exempt volume; the exempt column is the portion of that print that is
            not a directional short. Short % is short shares divided by TRF-reported volume, not by the full
            consolidated tape. A high percentage on a small print is ordinary. The useful signal is a large
            share count versus the recent median and versus float. This is daily short-sale volume. It is not
            bi-monthly short interest and not the Reg SHO threshold list, and it does not change the Short
            Check score. Each ticker is cached until the next weekday morning, when FINRA posts the next daily
            file.
          </p>
        </>
      ) : null}
    </div>
  );
}
