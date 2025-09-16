"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { Megaphone } from "lucide-react";

type Promotion = {
  date?: string | null;
  title?: string;
  type?: string;
  url: string;
};

function prettyDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

function typeBadgeClass(type?: string) {
  const t = (type || "").toLowerCase();
  if (t.includes("campaign")) return "bg-red-100 text-red-700";
  if (t.includes("disclosure")) return "bg-yellow-100 text-yellow-800";
  if (t.includes("press")) return "bg-blue-100 text-blue-700";
  if (t.includes("newsletter") || t.includes("email"))
    return "bg-purple-100 text-purple-700";
  return "bg-gray-100 text-gray-600";
}

export default function Promotions({ promotions = [] as Promotion[] }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xl font-semibold mb-3">
          <span role="img" aria-label="megaphone">
            📢
          </span>
          <span>Promotions</span>
        </div>

        {!promotions || promotions.length === 0 ? (
          <div className="text-gray-600">No promotions detected.</div>
        ) : (
          <ul className="space-y-2">
            {promotions.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <Megaphone size={16} className="shrink-0" />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {p.date && (
                    <span className="text-sm text-gray-700">
                      {prettyDate(p.date)}
                    </span>
                  )}

                  {p.type && (
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${typeBadgeClass(
                        p.type
                      )}`}
                    >
                      {p.type}
                    </span>
                  )}

                  {p.title ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {p.title}
                    </a>
                  ) : (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
