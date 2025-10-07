"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import CardTitle from "./CardTitle";

interface Props {
  ticker: string;
  result: any;
  manualFlags: Record<string, boolean>;
  toggleManualFlag: (key: string) => void;
}

const LABELS: Record<string, { label: string }> = {
  sudden_volume_spike: { label: "Sudden volume spike" },
  sudden_price_spike: { label: "Sudden price spike" },
  valuation_fundamentals_mismatch: { label: "Valuation mismatch" },
  reverse_split: { label: "Reverse split" },
  dilution_offering: { label: "Dilution / offering filing" },
  promoted_stock: { label: "Promoted stock (<30d)" },
  fraud_evidence: { label: "Fraud evidence posted online" },
  risky_country: { label: "Risky country (China/HK/Singapore/Malaysia)" },
  high_insider_ownership: { label: "High insider ownership (≥40%)" },
};

const MANUAL_LABELS: Record<string, { label: string }> = {
  pumpSuspicion: { label: "Pump suspicion" },
  thinFloat: { label: "Thin float risk" },
  insiders: { label: "Shady insiders" },
  other: { label: "Other red flag" },
};

export default function Criteria({
  ticker,
  result,
  manualFlags,
  toggleManualFlag,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const boxClass = (active: boolean) =>
    `flex items-center justify-between space-x-2 p-2 rounded transition ${
      active
        ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 border border-red-400 shadow-sm"
        : "hover:bg-gray-100 dark:hover:bg-gray-700"
    }`;

  // Determine if criterion is active
  const isActive = (key: string): boolean => {
    if (key === "high_insider_ownership") return result?.insiderOwnership >= 40;
    if (key === "promoted_stock")
      return (
        Array.isArray(result?.recentPromotions) &&
        result.recentPromotions.length > 0
      );
    return !!result?.[key];
  };

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow">
      <CardTitle icon="✅" ticker={ticker} label="Criteria" />

      {/* Automatic checks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Object.entries(LABELS).map(([key, { label }]) => {
          const val = isActive(key);
          const insiderPct = result?.insiderOwnership ?? null;

          const evidenceKey =
            key === "promoted_stock"
              ? "promotionEvidence"
              : key === "fraud_evidence"
              ? "fraudImages"
              : null;

          const evidence: any[] = evidenceKey ? result?.[evidenceKey] || [] : [];

          const filteredEvidence =
            key === "fraud_evidence"
              ? evidence.filter(
                  (item: any) =>
                    (item.caption || "").toLowerCase() !== "manual check"
                )
              : evidence;

          const evidenceCount = filteredEvidence.length;

          return (
            <div key={key} className={boxClass(val)}>
              <div className="flex items-center space-x-2 flex-1">
                <input type="checkbox" checked={val} readOnly disabled />
                <span
                  className={`flex items-center ${
                    key === "high_insider_ownership" && insiderPct >= 40
                      ? "text-red-700 dark:text-red-300 font-semibold"
                      : ""
                  }`}
                >
                  {label}
                  {key === "high_insider_ownership" &&
                    insiderPct !== null &&
                    ` — ${insiderPct.toFixed(1)}%`}
                  {evidenceCount > 0 && (
                    <span
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [key]: !prev[key],
                        }))
                      }
                      className="ml-2 inline-flex items-center px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full cursor-pointer hover:bg-blue-200 transition"
                      title="Click to toggle evidence"
                    >
                      {evidenceCount}
                    </span>
                  )}
                </span>
              </div>

              {evidenceCount > 0 && expanded[key] && (
                <Card className="ml-6 mt-2 bg-white dark:bg-gray-900 shadow-sm border rounded-xl col-span-2">
                  <CardContent className="p-2">
                    <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-200 mt-1">
                      {filteredEvidence.map((item: any, i: number) => (
                        <li key={i}>
                          {item.source && <strong>{item.source}: </strong>}
                          {item.title || item.caption || "Evidence"}
                          {item.date ? ` (${item.date})` : ""}
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 text-blue-500 underline"
                            >
                              link
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>

      {/* Manual Checks */}
      <h3 className="text-md font-semibold mt-4 mb-1">📝 Manual Checks</h3>
      <p className="text-xs mb-2 text-gray-600 dark:text-gray-400">
        Toggle these boxes to manually add extra risk factors to the score.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Object.entries(MANUAL_LABELS).map(([key, { label }]) => {
          const active = !!manualFlags[key];
          return (
            <div key={key} className={boxClass(active)}>
              <div className="flex items-center space-x-2 flex-1">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleManualFlag(key)}
                  className="cursor-pointer"
                />
                <span className="cursor-pointer">{label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
