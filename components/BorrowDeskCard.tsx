"use client";
import CardTitle from "./CardTitle";

export default function BorrowDeskCard({
  ticker,
  borrowData,
}: {
  ticker: string;
  borrowData?: { fee: string; available: string; updated: string; source: string };
}) {
  if (!borrowData) return null;

  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 shadow">
      <CardTitle icon="💸" ticker={ticker} label="iBorrowDesk" />

      {borrowData.fee === "Manual Check" ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Data unavailable — please manually check{" "}
          <a
            href={borrowData.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            iBorrowDesk
          </a>
        </p>
      ) : (
        <div className="text-sm space-y-1">
          <p>
            <span className="font-medium">Fee:</span>{" "}
            <span className="text-red-600">{borrowData.fee}%</span>
          </p>
          <p>
            <span className="font-medium">Available:</span>{" "}
            {borrowData.available}
          </p>
          <p>
            <span className="font-medium">Updated:</span>{" "}
            {borrowData.updated}
          </p>
          <p>
            <a
              href={borrowData.source}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              View on iBorrowDesk
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
