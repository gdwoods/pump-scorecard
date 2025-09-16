"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/Card";

function promotionIcon(type: string) {
  switch (type) {
    case "campaign":
      return "\ud83d\udce2";
    case "disclosure":
      return "\ud83d\udcc4";
    case "press_release":
      return "\ud83d\udcf0";
    default:
      return "\ud83d\udce2";
  }
}

export default function Promotions({ promotions }: { promotions: any[] }) {
  return (
    <Card>
      <CardContent>
        <h3 className="text-lg font-bold">\ud83d\udce2 Promotions</h3>
        {promotions?.length ? (
          <ul className="list-disc list-inside space-y-1">
            {promotions.map((p, idx) => (
              <li key={idx} className="ml-4">
                {promotionIcon(p.type)} {p.promotion_date} — {p.company_name} — {p.promoting_firm || "Unknown"} —
                <a href={p.url} className="text-blue-500 ml-1" target="_blank">
                  View
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No promotions detected.</p>
        )}
      </CardContent>
    </Card>
  );
}