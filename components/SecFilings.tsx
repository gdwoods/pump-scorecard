"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { FileText } from "lucide-react";

type Filing = {
  title: string;
  date: string;
  url: string;
  description: string;
};

export default function SecFilings({
  filings,
  allFilings,
  float,
  goingConcernDetected,
}: {
  filings: Filing[];
  allFilings: Filing[];
  float: number | null;
  goingConcernDetected: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  const list = showAll ? allFilings : filings;

  return (
    <Card>
      <CardContent>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5" />
            SEC Filings
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAll(false)}
              className={`px-2 py-1 rounded text-sm ${
                !showAll ? "bg-blue-600 text-white" : "bg-gray-200"
              }`}
            >
              Dilution-Only
            </button>
            <button
              onClick={() => setShowAll(true)}
              className={`px-2 py-1 rounded text-sm ${
                showAll ? "bg-blue-600 text-white" : "bg-gray-200"
              }`}
            >
              All Filings
            </button>
          </div>
        </div>

        {float && (
          <div className="text-sm text-gray-600 mb-2">
            Estimated Float: {float.toLocaleString()}
          </div>
        )}
        {goingConcernDetected && (
          <div className="text-sm text-red-600 mb-2">
            ⚠️ Going Concern language detected in recent filings
          </div>
        )}

        {list && list.length > 0 ? (
          <ul className="space-y-2">
            {list.map((f, idx) => (
              <li key={idx} className="text-sm">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">
                    {f.date !== "Unknown" ? f.date : ""}
                  </span>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {f.title && f.title !== "Unknown" ? f.title : "Untitled Filing"}
                  </a>
                  {f.description && f.description !== "Untitled Filing" && (
                    <span className="text-xs text-gray-500">{f.description}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-gray-600">No filings found.</div>
        )}
      </CardContent>
    </Card>
  );
}
