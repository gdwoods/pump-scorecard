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
        <h2 className="text-gray-900 dark:text-gray-100 font-semibold text-lg sm:text-xl mb-2">
          📢 Promotions
        </h2>

        {items.length === 0 ? (
          <p className="text-gray-800 dark:text-gray-200 text-base sm:text-lg">
            No promotions found.
          </p>
        ) : (
          <ul className="list-disc list-inside space-y-2">
            {items.map((promo, idx) => {
              const isFallback = promo.type === "Manual Check";
              const mainText = [promo.type, promo.date].filter(Boolean).join(" — ");

              return (
                <li
                  key={idx}
                  className={`text-base sm:text-lg ${
                    isFallback ? "italic text-gray-700 dark:text-gray-300" : "text-gray-900 dark:text-gray-100"
                  }`}
                >
                  <span>{mainText || "Unknown"}</span>
                  {promo.url && (
                    <>
                      {" — "}
                      <a
                        href={promo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`underline font-medium ${
                          isFallback
                            ? "text-blue-500 dark:text-blue-400"
                            : "text-blue-600 dark:text-blue-400"
                        }`}
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
