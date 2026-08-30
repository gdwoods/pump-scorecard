"use client";

type RiskSynopsisSectionProps = {
  synopsis: string;
  secNote?: string | null;
  secFilingUrl?: string | null;
  disagreement?: string | null;
};

export default function RiskSynopsisSection({
  synopsis,
  secNote,
  secFilingUrl,
  disagreement,
}: RiskSynopsisSectionProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Fundamental context
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{synopsis}</p>
      {(secNote || disagreement) && (
        <div className="pt-2 space-y-1.5 border-t border-current/10">
          {secNote && (
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              <span className="font-medium text-gray-600 dark:text-gray-300">SEC evidence: </span>
              {secNote}
              {secFilingUrl && (
                <>
                  {" "}
                  <a
                    href={secFilingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    Open filing
                  </a>
                </>
              )}
            </p>
          )}
          {disagreement && (
            <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/25 rounded px-2 py-1">
              {disagreement}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
