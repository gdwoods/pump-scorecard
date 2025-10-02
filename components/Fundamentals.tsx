"use client";

type FundamentalsProps = {
  ticker: string;
  result: {
    lastPrice?: number | null;
    marketCap?: number | null;
    sharesOutstanding?: number | null;
    floatShares?: number | null;
    avgVolume?: number | null;
    latestVolume?: number | null;
    shortFloat?: number | null;
    insiderOwnership?: number | null;
    institutionalOwnership?: number | null;
  };
};

function formatNumber(num?: number | null): string {
  if (num == null) return "N/A";
  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(2) + "K";
  return num.toString();
}

function formatPercent(num?: number | null): string {
  if (num == null) return "N/A";
  return num.toFixed(1) + "%";
}

export default function Fundamentals({ ticker, result }: FundamentalsProps) {
  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-sm transition-colors">
      <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
        📊 {ticker} Fundamentals
      </h2>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-700 dark:text-gray-300">
        <li>
          <strong>Last Price:</strong>{" "}
          {result.lastPrice != null ? `$${result.lastPrice.toFixed(2)}` : "N/A"}
        </li>
        <li>
          <strong>Market Cap:</strong> {formatNumber(result.marketCap)}
        </li>
        <li>
          <strong>Shares Outstanding:</strong>{" "}
          {formatNumber(result.sharesOutstanding)}
        </li>
        <li>
          <strong>Float Shares:</strong> {formatNumber(result.floatShares)}
        </li>
        <li>
          <strong>Avg Daily Volume:</strong> {formatNumber(result.avgVolume)}
        </li>
        <li>
          <strong>Latest Volume:</strong> {formatNumber(result.latestVolume)}
        </li>
        <li>
          <strong>Short Float:</strong> {formatPercent(result.shortFloat)}
        </li>
        <li>
          <strong>Insider Ownership:</strong>{" "}
          {formatPercent(result.insiderOwnership)}
        </li>
        <li>
          <strong>Institutional Ownership:</strong>{" "}
          {formatPercent(result.institutionalOwnership)}
        </li>
      </ul>
    </div>
  );
}
