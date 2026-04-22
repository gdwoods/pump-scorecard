"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

export type TopGainerApiRow = {
  ticker: string;
  changePct: number | null;
  changeAbs: number | null;
  price: number | null;
  volume: number | null;
  askEdgar: { overallOfferingRisk: string | null } | null;
};

type ApiResponse = {
  error?: string;
  source?: "polygon" | "tradingview";
  askEdgarConfigured?: boolean;
  askEdgarEnriched?: boolean;
  askEdgarHits?: number;
  count?: number;
  gainers?: TopGainerApiRow[];
  updatedAt?: string;
};

function riskPillClass(risk: string | null | undefined): string {
  if (!risk) return "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200";
  const u = risk.toLowerCase();
  if (u.includes("high")) return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  if (u.includes("medium") || u.includes("moderate"))
    return "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100";
  if (u.includes("low")) return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100";
  return "bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200";
}

function fmtPrice(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function fmtVol(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

export default function TopGainersPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeOtc, setIncludeOtc] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams();
      if (includeOtc) q.set("includeOtc", "1");
      const res = await fetch(`/api/top-gainers?${q.toString()}`);
      const json = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setErr(json.error || `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [includeOtc]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="p-6 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Top gainers
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Primary source: Polygon&apos;s official top-gainers snapshot (requires
            exchange-reported data; often empty overnight until ~4am ET). If that
            list is empty, we fall back to TradingView&apos;s public scanner
            (premarket % change, common 2–4 letter tickers, ≥20% move). Rows are
            limited to last price between $0.60 and $25. Ask Edgar
            dilution on the first 20 rows when{" "}
            <code className="text-xs bg-gray-100 dark:bg-gray-900 px-1 rounded">
              ASKEDGAR_API_KEY
            </code>{" "}
            is set.
          </p>
          {data?.updatedAt && (
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Updated {new Date(data.updatedAt).toLocaleString()}
              {data.source === "tradingview"
                ? " · Source: TradingView (Polygon snapshot was empty)"
                : data.source === "polygon"
                  ? " · Source: Polygon"
                  : ""}
              {data.askEdgarEnriched ? " · Ask Edgar enriched" : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeOtc}
              onChange={(e) => setIncludeOtc(e.target.checked)}
              className="rounded border-gray-300"
            />
            Include OTC
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
          {err}
        </div>
      )}

      {!err && data && data.askEdgarConfigured === false && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100 text-sm border border-amber-200 dark:border-amber-800">
          <strong className="font-semibold">Ask Edgar risk column is off.</strong>{" "}
          Add{" "}
          <code className="text-xs bg-white/60 dark:bg-black/30 px-1 rounded">
            ASKEDGAR_API_KEY
          </code>{" "}
          (or{" "}
          <code className="text-xs bg-white/60 dark:bg-black/30 px-1 rounded">
            ASK_EDGAR_API_KEY
          </code>
          ) to{" "}
          <code className="text-xs bg-white/60 dark:bg-black/30 px-1 rounded">
            .env.local
          </code>{" "}
          and restart{" "}
          <code className="text-xs bg-white/60 dark:bg-black/30 px-1 rounded">
            npm run dev
          </code>
          . The key is only read on the server.
        </div>
      )}

      {!err &&
        data?.askEdgarConfigured &&
        data.askEdgarEnriched &&
        (data.askEdgarHits ?? 0) === 0 &&
        (data.gainers?.length ?? 0) > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 text-sky-900 dark:text-sky-100 text-sm border border-sky-200 dark:border-sky-800">
            Ask Edgar is configured, but no dilution ratings came back for these
            symbols (trial tier, symbol coverage, or API error). Check server
            logs; confirm your key can access the dilution-rating endpoint.
          </div>
        )}

      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
              <th className="py-2 pr-3 font-medium">Ticker</th>
              <th className="py-2 pr-3 font-medium">% Chg</th>
              <th className="py-2 pr-3 font-medium">Last</th>
              <th className="py-2 pr-3 font-medium">Volume</th>
              <th className="py-2 pr-3 font-medium">Ask Edgar risk</th>
              <th className="py-2 font-medium">Scorecard</th>
            </tr>
          </thead>
          <tbody>
            {(data?.gainers || []).map((row) => (
              <tr
                key={row.ticker}
                className="border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50 dark:hover:bg-gray-700/40"
              >
                <td className="py-2 pr-3 font-semibold text-gray-900 dark:text-gray-100">
                  {row.ticker}
                </td>
                <td className="py-2 pr-3 tabular-nums text-emerald-600 dark:text-emerald-400">
                  {row.changePct != null
                    ? `${row.changePct >= 0 ? "+" : ""}${row.changePct.toFixed(2)}%`
                    : "—"}
                </td>
                <td className="py-2 pr-3 tabular-nums">{fmtPrice(row.price)}</td>
                <td className="py-2 pr-3 tabular-nums">{fmtVol(row.volume)}</td>
                <td className="py-2 pr-3">
                  {row.askEdgar?.overallOfferingRisk ? (
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${riskPillClass(
                        row.askEdgar.overallOfferingRisk
                      )}`}
                    >
                      {row.askEdgar.overallOfferingRisk}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  )}
                </td>
                <td className="py-2">
                  <Link
                    href={`/pump-scorecard?ticker=${encodeURIComponent(row.ticker)}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data?.gainers?.length === 0 && (
          <div className="text-gray-600 dark:text-gray-400 text-sm py-6 text-center space-y-2 max-w-lg mx-auto">
            <p>No tickers returned.</p>
            <p className="text-xs">
              Polygon&apos;s movers list can be empty outside regular session
              (cleared ~3:30am ET, refills as trades print; 10k+ volume filter).
              Fallback uses TradingView — add{" "}
              <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">
                ?tvFallback=0
              </code>{" "}
              to the API URL to disable it for debugging.
            </p>
          </div>
        )}
        {loading && !data?.gainers?.length && (
          <p className="text-gray-500 dark:text-gray-400 text-sm py-6 text-center">
            Loading gainers…
          </p>
        )}
      </div>
    </Card>
  );
}
