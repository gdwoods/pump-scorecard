"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import AppNav from "@/components/AppNav";
import type { FastVerdict, FastVerdictKind } from "@/lib/fast/types";

type Row = {
  ticker: string;
  status: "pending" | "ok" | "error";
  fastVerdict?: FastVerdict | null;
  droppinessScore?: number | null;
  cpScore?: number | null;
  cpStatus?: string | null;
  error?: string;
};

const FAST_BADGE: Record<FastVerdictKind, string> = {
  NO_TRADE: "bg-red-600 text-white",
  WATCH: "bg-amber-500 text-white",
  REVIEW: "bg-sky-600 text-white",
};

function parseTickers(raw: string): string[] {
  return [...new Set(raw.split(/[\s,]+/).map((t) => t.trim().toUpperCase()).filter(Boolean))].slice(
    0,
    20
  );
}

function FastBadge({ verdict }: { verdict: FastVerdictKind }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${FAST_BADGE[verdict]}`}>
      {verdict.replace("_", " ")}
    </span>
  );
}

export default function WatchlistPage() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  async function runWatchlist() {
    const tickers = parseTickers(input);
    if (!tickers.length) return;
    setLoading(true);
    setRows(tickers.map((ticker) => ({ ticker, status: "pending" })));

    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const [scanRes, fastRes] = await Promise.all([
            fetch(`/api/scan/${ticker}`),
            fetch(`/api/fast/${ticker}?fmt=json`),
          ]);
          const scanJson = scanRes.ok ? await scanRes.json() : null;
          const fastJson = fastRes.ok ? await fastRes.json() : null;
          setRows((prev) =>
            prev.map((r) =>
              r.ticker === ticker
                ? {
                    ticker,
                    status: "ok",
                    fastVerdict: fastJson,
                    droppinessScore: scanJson?.droppinessScore ?? null,
                    cpScore: scanJson?.capitalPressure?.score ?? null,
                    cpStatus: scanJson?.capitalPressure?.status ?? null,
                  }
                : r
            )
          );
        } catch (err) {
          setRows((prev) =>
            prev.map((r) =>
              r.ticker === ticker
                ? {
                    ticker,
                    status: "error",
                    error: err instanceof Error ? err.message : "Scan failed",
                  }
                : r
            )
          );
        }
      })
    );

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">Watchlist</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Scan up to 20 tickers in parallel — Fast Verdict, Droppiness, and Capital Pressure.
            </p>
          </div>
          <AppNav />
        </div>

        <Card className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <label className="text-sm text-gray-600 dark:text-gray-400 block mb-2">
            Tickers (comma or newline separated)
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder="AEHL, DFNS, BNAI"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          />
          <button
            type="button"
            onClick={() => void runWatchlist()}
            disabled={loading || !input.trim()}
            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            {loading ? "Scanning…" : "Scan watchlist"}
          </button>
        </Card>

        {rows.length > 0 && (
          <Card className="overflow-hidden border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Ticker</th>
                  <th className="px-3 py-2">Fast</th>
                  <th className="px-3 py-2">Drop</th>
                  <th className="px-3 py-2">CP</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.ticker} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="px-3 py-2 font-medium">{row.ticker}</td>
                    <td className="px-3 py-2">
                      {row.status === "pending" && "…"}
                      {row.status === "error" && (
                        <span className="text-red-600 dark:text-red-400">{row.error}</span>
                      )}
                      {row.status === "ok" && row.fastVerdict?.verdict && (
                        <FastBadge verdict={row.fastVerdict.verdict} />
                      )}
                      {row.status === "ok" && !row.fastVerdict?.verdict && "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.droppinessScore != null ? row.droppinessScore : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.cpScore != null ? `${row.cpScore} (${row.cpStatus})` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <Link
                        href={`/fast-scan?t=${row.ticker}`}
                        className="text-blue-600 dark:text-blue-400 underline"
                      >
                        Fast
                      </Link>
                      <Link
                        href={`/short-check/${row.ticker}`}
                        className="text-blue-600 dark:text-blue-400 underline"
                      >
                        Short
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
