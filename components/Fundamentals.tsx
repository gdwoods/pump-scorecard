"use client";

type Props = {
  result: any;
  hideCountryRow?: boolean; // NEW
};

export default function Fundamentals({ result, hideCountryRow = false }: Props) {
  const rows: { label: string; value: any; className?: string }[] = [
    { label: "Market Cap", value: fmtCurrency(result.marketCap) },
    { label: "Shares Outstanding", value: fmtNumber(result.sharesOutstanding) },
    { label: "Float Shares", value: fmtNumber(result.floatShares) },
    { label: "Short Float", value: result.shortFloat ?? "N/A" },
    { label: "Insider Ownership", value: pct(result.insiderOwn) },
    { label: "Institutional Ownership", value: pct(result.instOwn) },
    { label: "Exchange", value: result.exchange || "Unknown" },
  ];

  if (!hideCountryRow) {
    rows.push({ label: "Country", value: result.country || "Unknown", className: result.country === "Unknown" ? "text-orange-600" : "" });
  }

  return (
    <div className="border rounded-lg p-4">
      <div className="font-semibold mb-2">📝 Fundamentals</div>
      <ul className="list-disc list-inside space-y-1">
        {rows.map((r, i) => (
          <li key={i} className={r.className || ""}>
            <span className="font-medium">{r.label}:</span> {r.value}
          </li>
        ))}
      </ul>
    </div>
  );
}

function fmtNumber(n: number | null | undefined) {
  if (typeof n !== "number") return "N/A";
  return n.toLocaleString();
}
function fmtCurrency(n: number | null | undefined) {
  if (typeof n !== "number") return "N/A";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function pct(n: number | null | undefined) {
  if (typeof n !== "number") return "N/A";
  return `${(n * 100).toFixed(1)}%`;
}
