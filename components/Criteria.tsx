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

const LABELS: Record<string, { label: string; weight: number }> = {
  sudden_volume_spike: { label: "Sudden volume spike", weight: 10 },
  sudden_price_spike: { label: "Sudden price spike", weight: 10 },
  valuation_fundamentals_mismatch: { label: "Valuation mismatch", weight: 15 },
  reverse_split: { label: "Reverse split", weight: 10 },
  dilution_offering: { label: "Dilution/offering filing", weight: 20 },
  promoted_stock: { label: "Promoted stock", weight: 15 },
  fraud_evidence: { label: "Fraud evidence posted online", weight: 20 },
  risky_country: {
    label: "Risky country (China/HK/Singapore/Malaysia)",
    weight: 15,
  },
  high_insider_ownership: {
    label: "High insider ownership (≥40%)",
    weight: 10,
  }, // ✅ new
};

const MANUAL_LABELS: Record<string, { label: string; weight: number }> = {
  pumpSuspicion: { label: "Pump suspicion", weight: 15 },
  thinFloat: { label: "Thin float risk", weight: 10 },
  insiders: { label: "Shady insiders", weight: 10 },
  other: { label: "Other red flag", weight: 5 },
};

export default function Criteria({
  ticker,
  result,
  manualFlags,
  toggleManualFlag,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // ✅ include auto insider ownership check if >= 40%
  const autoKeys = Object.keys(LABELS).filter((k) => {
    if (k === "high_insider_ownership") {
      return result?.insiderOwnership >= 40;
    }
    return typeof result?.[k] === "boolean";
  });

  const boxClass = (active: boolean) =>
    `flex items-center justify-between space-x-2 p-2 rounded transition ${
      active
        ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 border border-red-400 shadow-sm"
        : "hover:bg-gray-100 dark:hover:bg-gray-700"
    }`;

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow">
      <CardTitle icon="✅" ticker={ticker} label="Criteria" />

      {/* Automatic checks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {autoKeys.map((key) => {
          const { label, weight } = LABELS[key];
          const val =
            key === "high_insider_ownership"
              ? result?.insiderOwnership >= 40
              : result?.[key];

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
            <div key={key} className={boxClass(!!val)}>
              <label className="flex items-center space-x-2 flex-1">
                <input type="checkbox" checked={!!val} readOnly disabled />
                <span
                  className={
                    key === "high_insider_ownership"
                      ? "flex items-center text-red-700 dark:text-red-300 font-semibold"
                      : "flex items-center"
                  }
                >
                  {label}
                  {key === "high_insider_ownership" &&
                    result?.insiderOwnership &&
                    ` — ${result.insiderOwnership.toFixed(1)}%`}
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
              </label>

              {/* ✅ Weight badge */}
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  val
                    ? "bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200"
                    : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                +{weight}
              </span>

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
                          {item.sourceUrl && (
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 text-blue-500 underline"
                            >
                              source
                            </a>
                          )}
                          {item.thumb && (
                            <a
                              href={item.full || item.thumb}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 text-blue-500 underline"
                            >
                              image
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

      {/* Manual checks */}
      <h3 className="text-md font-semibold mt-4 mb-1">📝 Manual Checks</h3>
      <p className="text-xs mb-2 text-gray-600 dark:text-gray-400">
        Toggle these boxes to manually add extra risk factors to the score.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Object.entries(MANUAL_LABELS).map(([key, { label, weight }]) => {
          const active = !!manualFlags[key];
          return (
            <div
              key={key}
              className={boxClass(active)}
              onClick={() => toggleManualFlag(key)}
            >
              <label className="flex items-center space-x-2 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  readOnly
                  className="pointer-events-none"
                />
                <span>{label}</span>
              </label>

              {/* ✅ Weight badge */}
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  active
                    ? "bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200"
                    : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                +{weight}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
