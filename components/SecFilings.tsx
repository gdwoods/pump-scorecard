"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { FileText } from "lucide-react";

type Filing = {
  title?: string;
  date?: string;
  url?: string;
  description?: string;
};

export default function SecFilings({
  filings = [],
  allFilings = [],
  float,
  goingConcernDetected,
}: {
  filings: Filing[];
  allFilings: Filing[];
  float?: number | null;
  goingConcernDetected?: boolean;
}) {
  const [view, setView] = useState<"dilution" | "all">("dilution");
  const list = view === "dilution" ? filings : allFilings;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xl font-semibold">
            <FileText size={20} />
            <span>SEC Filings</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView("dilution")}
              className={`px-2 py-1 rounded text-sm ${
                view === "dilution"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              Dilution-Only
            </button>
            <button
              onClick={() => setView("all")}
              className={`px-2 py-1 rounded text-sm ${
                view === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              All Filings
            </button>
          </div>
        </div>

        {list.length === 0 && (
          <div className="text-gray-600">No filings found.</div>
        )}

        {list.length > 0 && (
          <ul className="space-y-2">
            {list.map((f, i) => (
              <li key={i}>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {f.title} — {f.date}
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-1 text-sm text-gray-700">
          {typeof float === "number" && float < 75_000_000 && (
            <div>⚠️ Baby Shelf Risk: Float under $75M.</div>
          )}
          {goingConcernDetected && (
            <div>⚠️ Going concern language detected.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
