import Link from "next/link";
import TopGainersPanel from "@/components/TopGainersPanel";

export default function TopGainersPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-blue-600 dark:text-blue-400">
              Top gainers
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Polygon market movers ($0.60–$25 last price, ≥20% move) with optional Ask
              Edgar dilution overlay.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dilution-monitor"
              className="px-4 py-2 bg-[#0d1117] text-[#58a6ff] border border-[#30363d] rounded-lg hover:bg-[#161b22] text-sm font-medium"
            >
              Dilution monitor (layout)
            </Link>
            <Link
              href="/"
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:opacity-90 text-sm font-medium"
            >
              Home
            </Link>
            <Link
              href="/pump-scorecard"
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:opacity-90 text-sm font-medium"
            >
              Pump Scorecard
            </Link>
            <Link
              href="/short-check"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Short Check
            </Link>
          </div>
        </div>

        <TopGainersPanel />

        <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
          Data:{" "}
          <a
            href="https://polygon.io/docs/stocks/get_v2_snapshot_locale_us_markets_stocks__direction"
            className="text-blue-600 dark:text-blue-400 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Polygon snapshot gainers
          </a>
          . Dilution: Ask Edgar enterprise API.
        </p>
      </div>
    </div>
  );
}
