"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { FileText } from "lucide-react";

type Filing = {
  title: string;
  date: string;
  url: string;
};

type Props = {
  filings: Filing[];
  allFilings: Filing[];
  float?: number | null;
  goingConcernDetected?: boolean;
};

export default function SecFilings({
  filings,
  allFilings,
  float,
  goingConcernDetected,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? allFilings : filings;

  const isDilution = (title: string) =>
    ["S-1", "424B", "F-1", "F-3", "F-4", "S-3"].some((f) =>
      title.toUpperCase().includes(f)
    );

  const isBabyShelfRisk = (title: string) =>
    title.toUpperCase().includes("S-1") && (float ?? Infinity) < 75000000;

  const isGoingConcernFlag = (title: string) =>
    goingConcernDetected &&
    (title.toUpperCase().includes("10-Q") || title.toUpperCase().includes("10-K"));

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <FileText className="h-5 w-5" />
          SEC Filings
        </div>

        <div className="flex gap-4 text-sm">
          <button
            onClick={() => setShowAll(false)}
            className={`px-2 py-1 rounded ${
              !showAll
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Dilution-Only
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={`px-2 py-1 rounded ${
              showAll
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All Filings
          </button>
        </div>

        {shown.length === 0 ? (
          <p className="text-muted-foreground">No filings found.</p>
        ) : (
          <ul className="list-disc list-inside space-y-1">
            {shown.map((f, idx) => {
              const dilution = isDilution(f.title);
              const babyShelf = isBabyShelfRisk(f.title);
              const goingConcern = isGoingConcernFlag(f.title);

              return (
                <li key={idx}>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`hover:underline ${
                      dilution ? "text-red-600 font-semibold" : "text-blue-600"
                    }`}
                  >
                    {f.title} ({f.date})
                  </a>
                  {babyShelf && (
                    <span className="ml-2 text-xs bg-red-200 text-red-800 px-1 py-0.5 rounded">
                      Baby Shelf Risk
                    </span>
                  )}
                  {goingConcern && (
                    <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-1 py-0.5 rounded">
                      Going Concern
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
