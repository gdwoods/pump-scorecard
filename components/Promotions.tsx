"use client";

export default function Promotions({ promotions }: { promotions: any[] }) {
  const items = Array.isArray(promotions) ? promotions : [];

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-3">📢 Promotions</h2>

      {items.length === 0 || (items.length === 1 && items[0].type === "Manual Check") ? (
        <p className="text-sm text-gray-700">
          No promotions found for this ticker — please manually check at{" "}
          <a
            href="https://www.stockpromotiontracker.com/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            stockpromotiontracker.com
          </a>
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((p, i) => (
            <li key={i}>
              {p.date} — {p.type} (
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                Source
              </a>
              )
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
