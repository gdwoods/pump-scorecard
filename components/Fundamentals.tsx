"use client";

interface Props {
  result: any;
}

// Format large numbers to K/M/B/T
const formatNumber = (value: number | null, prefix = ""): string => {
  if (value == null || isNaN(value)) return "N/A";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${prefix}${(value / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${prefix}${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${prefix}${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${prefix}${(value / 1e3).toFixed(1)}K`;
  return `${prefix}${value}`;
};

// Format percentage values
const formatPercent = (value: number | null): string => {
  if (value == null || isNaN(value)) return "N/A";
  return `${value.toFixed(1)}%`;
};

export default function Fundamentals({ result }: Props) {
  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-3">📊 Fundamentals</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-8 text-sm">
        <span>Last Price: {formatNumber(result.lastPrice, "$")}</span>
        <span>Market Cap: {formatNumber(result.marketCap, "$")}</span>

        <span>
          Shares Outstanding: {formatNumber(result.sharesOutstanding)}
        </span>
        <span>Float Shares: {formatNumber(result.floatShares)}</span>

        <span>Avg Volume: {formatNumber(result.avgVolume)}</span>
        <span>Latest Volume: {formatNumber(result.latestVolume)}</span>

        <span
          className={
            result.shortFloat > 30 ? "text-red-600 font-semibold" : ""
          }
        >
          Short Float: {formatPercent(result.shortFloat)}
        </span>

        <span
          className={
            result.insiderOwnership > 20 ? "text-orange-600 font-semibold" : ""
          }
        >
          Insider Ownership: {formatPercent(result.insiderOwnership)}
        </span>

        <span>
          Institutional Ownership: {formatPercent(result.institutionalOwnership)}
        </span>

        <span>Country: {result.country || "Unknown"}</span>
        <span>Exchange: {result.exchange}</span>
      </div>
    </div>
  );
}
