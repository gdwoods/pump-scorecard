"use client";
import { useState } from "react";
import CollapsibleCard from "./CollapsibleCard";

type FraudItem = {
  full?: string | null;
  thumb?: string | null;
  caption?: string | null;
  sourceUrl?: string | null;
};

export default function FraudEvidence({
  ticker,
  fraudImages,
}: {
  ticker: string;
  fraudImages: FraudItem[];
}) {
  const items = Array.isArray(fraudImages) ? fraudImages : [];
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const isOnlyManual =
    items.length > 0 && items.every((it) => (it.caption || "").toLowerCase() === "manual check");

  const displayed = items.filter((it) => (it.caption || "").toLowerCase() !== "manual check");

  const manualUrl =
    (isOnlyManual && items[0]?.sourceUrl) || "https://www.stopnasdaqchinafraud.com/";

  return (
    <CollapsibleCard title={`🕵️ ${ticker} Fraud Evidence`} defaultOpen={true}>
      {/* Removed CardTitle here */}

      {items.length === 0 || isOnlyManual ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          No fraud evidence found for this ticker — please manually check at{" "}
          <a href={manualUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
            stopnasdaqchinafraud.com
          </a>
        </p>
      ) : (
        <ul className="space-y-3">
          {displayed.map((f, i) => (
            <li key={i} className="flex items-start gap-3">
              {f.thumb ? (
                <img
                  src={f.thumb}
                  alt={f.caption ?? "Fraud evidence"}
                  className="w-16 h-16 rounded object-cover cursor-pointer hover:opacity-80"
                  onClick={() => setLightboxUrl(f.full || f.thumb!)}
                />
              ) : (
                <div className="w-16 h-16 rounded bg-gray-100 border flex items-center justify-center text-xs text-gray-400">
                  N/A
                </div>
              )}
              <div className="text-sm">
                <div className="font-medium">{f.caption || "Evidence"}</div>
                {f.sourceUrl && (
                  <a
                    href={f.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline"
                  >
                    Source
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Fraud Evidence Full"
            className="max-w-[90%] max-h-[90%] rounded shadow-lg"
          />
        </div>
      )}
    </CollapsibleCard>
  );
}
