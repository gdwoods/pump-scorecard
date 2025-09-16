"use client";

import { Card, CardContent } from "@/components/ui/Card";

type RawPromotion = Record<string, any>;
type Promotion = {
  type: string;
  date?: string;
  url?: string;
};

function toTitleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(input?: string) {
  if (!input) return undefined;

  // Already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  // yyyymmdd → yyyy-mm-dd
  if (/^\d{8}$/.test(input)) {
    return `${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6, 8)}`;
  }

  // Try Date()
  const d = new Date(input);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];

  return undefined;
}

function normalizePromotion(p: RawPromotion): Promotion {
  const rawType =
    p.type ??
    p.promotion_type ??
    p.category ??
    p.kind ??
    "Unknown";

  const id = p.id ?? p.promotion_id ?? p.promo_id;
  const rawUrl = p.url ?? p.link ?? p.href;

  const url =
    rawUrl ??
    (id ? `https://www.stockpromotiontracker.com/promotion/${id}` : undefined);

  const date = formatDate(
    p.date ?? p.promotion_date ?? p.promotionDate ?? p.created_at ?? p.createdAt
  );

  return {
    type: toTitleCase(String(rawType)),
    date,
    url,
  };
}

export default function Promotions({ promotions }: { promotions: RawPromotion[] }) {
  const items = (promotions || []).map(normalizePromotion);

  return (
    <Card>
      <CardContent>
        <h2 className="text-lg font-semibold mb-2">📢 Promotions</h2>

        {items.length === 0 ? (
          <p className="text-gray-600">No promotions found.</p>
        ) : (
          <ul className="list-disc list-inside space-y-2">
            {items.map((promo, idx) => {
              const mainText = [promo.type, promo.date].filter(Boolean).join(" — ");
              return (
                <li key={idx} className="text-sm">
                  <span>{mainText || "Unknown"}</span>
                  {promo.url && (
                    <>
                      {" — "}
                      <a
                        href={promo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
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
