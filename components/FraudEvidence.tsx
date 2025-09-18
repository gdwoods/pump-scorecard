// components/FraudEvidence.tsx
"use client";

import React from "react";

type FraudImage = {
  full: string | null;
  thumb: string | null;
  approvedAt: string | null;
  type?: string;
  url?: string;
};

interface Props {
  fraudImages: FraudImage[];
}

export default function FraudEvidence({ fraudImages }: Props) {
  if (!fraudImages || fraudImages.length === 0) {
    return null;
  }

  // If only Manual Check fallback
  if (fraudImages.length === 1 && fraudImages[0].type === "Manual Check") {
    return (
      <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow">
        <h2 className="text-lg font-semibold mb-2">🚨 Fraud Evidence</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-3">
          No fraud images were found for this ticker, but you can manually check here:
        </p>
        <a
          href={fraudImages[0].url || "https://www.stopnasdaqchinafraud.com/"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500"
        >
          Open Stop Nasdaq China Fraud
        </a>
      </div>
    );
  }

  // Otherwise, render images
  return (
    <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow">
      <h2 className="text-lg font-semibold mb-2">🚨 Fraud Evidence</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {fraudImages.map((img, idx) => (
          <a
            key={idx}
            href={img.full || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            {img.thumb ? (
              <img
                src={img.thumb}
                alt="Fraud Evidence"
                className="rounded-lg shadow"
              />
            ) : (
              <div className="w-full h-24 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center text-xs text-gray-500">
                No preview
              </div>
            )}
            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mt-1">
              {img.approvedAt?.slice(0, 10) || ""}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
