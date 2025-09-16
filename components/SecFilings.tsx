"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { FileText } from "lucide-react";

type Filing = {
  title?: string;
  date?: string;
  url?: string;
  description?: string;
};

function formatDate(date?: string) {
  if (!date) return "Unknown";
  const d = new Date(date);
  return isNaN(d.getTime()) ? date : d.toISOString().split("T")[0];
}

function typeBadgeClass(title?: string) {
  const t = (title || "").toUpperCase();
  if (t.includes("S-1")) return "bg-red-100 text-red-700";
  if (t.includes("424B")) return "bg-yellow-100 text-yellow-800";
  if (t.includes("10-K")) return "bg-blue-100 text-blue-700";
  if (t.includes("10-Q")) return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-600";
}

function filingType(title?: string) {
  if (!title) return "Unknown";
  const t = title.toUpperCase();
  if (t.includes("S-1")) return "Registration (S-1)";
  if (t.includes("424B")) return "Prospectus (424B)";
  if (t.includes("10-K")) return "Annual (10-K)";
  if (t.includes("10-Q")) return "Quarterly (10-Q)";
  return title;
}

export default function SecFilings({
  filings = [],
  allFilings = [],
  float,
  goingConcernDetected,
}: {
  filings: Filing[];
  allFilings?: Filing[];
  float?: number | null;
  goingConcernDetected?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xl font-semibold mb-3">
          <FileText size={20} />
          <span>SEC Filings</span>
        </div>

        {(!filings || filings.length === 0) && (
          <div className="text-gray-600">No recent dilution filings found.</div>
        )}

        {filings && filings.length > 0 && (
          <ul className="space-y-2">
            {filings.map((f, i) => (
              <li key={i} className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${typeBadgeClass(
                      f.title
                    )}`}
                  >
                    {filingType(f.title)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatDate(f.date)}
                  </span>
                </div>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {f.description || f.title || "Untitled Filing"}
                </a>
              </li>
            ))}
          </ul>
        )}

        {/* Extra info */}
        <div className="mt-4 space-y-1 text-sm text-gray-700">
          {typeof float === "number" && float < 75_000_000 && (
            <div>
              ⚠️ Baby Shelf Risk: Float is under $75M (approx {float.toLocaleString()} shares).
            </div>
          )}
          {goingConcernDetected && (
            <div>⚠️ Going concern language detected in filings.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
