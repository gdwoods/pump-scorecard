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

const LABELS: Record<string, string> = {
  sudden_volume_spike: "Sudden volume spike",
  sudden_price_spike: "Sudden price spike",
  valuation_fundamentals_mismatch: "Valuation mismatch",
  reverse_split: "Reverse split",
  dilution_offering: "Dilution/offering filing",
  promoted_stock: "Promoted stock",
  fraud_evidence: "Fraud evidence posted online",
  risky_country: "Risky country (China/HK/Malaysia)",
};

const MANUAL_LABELS: Record<string, string> = {
  pumpSuspicion: "Pump suspicion",
  thinFloat: "Thin float risk",
  insiders: "Shady insiders",
  other: "Other red flag",
};

export default function Criteria({ ticker, result, manualFlags, toggleManualFlag }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const autoKeys = Object.keys(LABELS).filter((k) => typeof result?.[k] === "boolean");

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow">
      <CardTitle icon="✅" ticker={ticker} label="Criteria" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {autoKeys.map((key) => {
          const val = result?.[key];
          const label = LABELS[key] || key;

          const evidenceKey =
            key === "promoted_stock"
              ? "promotionEvidence"
              : key === "fraud_evidence"
              ? "fraudImages"
              : null;

          const evidence: any[] = evidenceKey ? result?.[evidenceKey] || [] : [];
          const evidenceCount = evidence.length;

          return (
            <div key={key}>
              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={!!val} readOnly disabled />
                <span className="flex items-center">
                  {label}
                  {evidenceCount > 0 && (
                    <span
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      className="ml-2 inline-flex items-center px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full cursor-pointer hover:bg-blue-200 transition"
                      title="Click to toggle evidence"
                    >
                      {evidenceCount}
                    </span>
                  )}
                </span>
              </label>

              {evidenceCount > 0 && expanded[key] && (
                <Card className="ml-6 mt-2 bg-white shadow-sm border rounded-xl">
                  <CardContent className="p-2">
                    <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-200 mt-1">
                      {evidence.map((item: any, i: number) => (
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

      <h3 className="text-md font-semibold mt-4 mb-2">📝 Manual Checks</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Object.entries(MANUAL_LABELS).map(([key, label]) => (
          <label key={key} className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={!!manualFlags[key]}
              onChange={() => toggleManualFlag(key)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
