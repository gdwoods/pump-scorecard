"use client";

import { Card, CardContent } from "@/components/ui/Card";

type Promotion = {
  type: string;
  date?: string;
  url?: string;
};

export default function Promotions({ promotions }: { promotions: Promotion[] }) {
  const items = promotions || [];

  return (
    <Card>
      <CardContent>
        <h2 className="text-lg font-semibold mb-2">📢 Promotions</h2>

        {items.length === 0 ? (
          <p className="text-gray-600">No promotions found.</p>
        ) : (
          <ul className="list-disc list-inside space-y-2">
            {items.map((promo, idx) => {
              const isFallback = promo.type === "Manual Check";
              const mainText = [promo.type, promo.date].filter(Boolean).join(" — ");

              return (
                <li
                  key={idx}
                  className={`text-sm ${isFallback ? "italic text-gray-500" : ""}`}
                >
                  <span>{mainText || "Unknown"}</span>
                  {promo.url && (
                    <>
                      {" — "}
                      <a
                        href={promo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`underline ${isFallback ? "text-gray-500" : "text-blue-600"}`}
                      >
                        View
                      </a>
                    </>
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
