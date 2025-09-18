"use client";

type FraudEvidenceProps = {
  fraudImages: { full: string; thumb: string; approvedAt?: string }[];
};

export default function FraudEvidence({ fraudImages }: FraudEvidenceProps) {
  if (!fraudImages || fraudImages.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          ⚠️ Fraud Evidence
        </h2>
        <p className="text-base text-gray-700 dark:text-gray-300">
          No fraud images found.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow">
      <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        ⚠️ Fraud Evidence
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {fraudImages.map((img, idx) => (
          <div key={idx} className="text-center">
            <a href={img.full} target="_blank" rel="noopener noreferrer">
              <img
                src={img.thumb}
                alt="Fraud evidence"
                className="rounded-lg shadow border"
              />
            </a>
            {img.approvedAt && (
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {new Date(img.approvedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
