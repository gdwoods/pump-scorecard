// components/FraudEvidence.tsx
"use client";

interface FraudImage {
  full: string | null;
  thumb: string | null;
  approvedAt: string | null;
  caption?: string | null;
  type?: string;
  url?: string;
}

export default function FraudEvidence({ fraudImages }: { fraudImages: FraudImage[] }) {
  if (!fraudImages || fraudImages.length === 0) return null;

  const manualCheckOnly =
    fraudImages.length === 1 && fraudImages[0].type === "Manual Check";

  return (
    <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow">
      <h2 className="text-lg font-semibold mb-2">🕵️ Fraud Evidence</h2>

      {manualCheckOnly ? (
        <p className="text-gray-600 dark:text-gray-300">
          No fraud images found. Please{" "}
          <a
            href="https://www.stopnasdaqchinafraud.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            check manually
          </a>
          .
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {fraudImages.map((img, idx) => (
            <div
              key={idx}
              className="flex flex-col items-center bg-gray-50 dark:bg-gray-900 rounded-lg shadow-sm p-2"
            >
              {img.thumb ? (
                <a href={img.full || img.thumb} target="_blank" rel="noopener noreferrer">
                  <img
                    src={img.thumb}
                    alt={img.caption || `Fraud evidence ${idx + 1}`}
                    className="rounded-lg w-full object-cover"
                  />
                </a>
              ) : (
                <div className="text-gray-500">No image</div>
              )}

              {/* ✅ New: Show caption */}
              {img.caption && (
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 text-center">
                  {img.caption}
                </p>
              )}

              {img.approvedAt && (
                <p className="text-xs text-gray-400 mt-1">
                  Approved: {new Date(img.approvedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
