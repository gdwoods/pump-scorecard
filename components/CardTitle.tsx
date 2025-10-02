// components/CardTitle.tsx
"use client";

export default function CardTitle({
  icon,
  ticker,
  label,
}: {
  icon: string;
  ticker: string;
  label: string;
}) {
  return (
    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
      <span>{icon}</span>
      <span className="text-gray-800 dark:text-gray-200">
        {ticker} {label}
      </span>
    </h2>
  );
}
