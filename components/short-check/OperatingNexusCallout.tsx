type OperatingNexusView = {
  headline?: string;
  places?: string[];
  evidence?: Array<{
    form?: string;
    filingDate?: string;
    documentUrl?: string;
    excerpt?: string;
  }>;
};

export default function OperatingNexusCallout({ nexus }: { nexus?: OperatingNexusView | null }) {
  if (!nexus?.headline) return null;
  const evidence = (nexus.evidence || []).filter((item) => item.excerpt);

  return (
    <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
        Operating nexus
      </p>
      <p className="mt-0.5 text-xs font-medium leading-relaxed">{nexus.headline}</p>
      {evidence.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {evidence.map((item, index) => (
            <li
              key={`${item.form}-${item.filingDate}-${index}`}
              className="text-xs leading-relaxed text-amber-900 dark:text-amber-200/90"
            >
              {item.documentUrl ? (
                <a
                  href={item.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline hover:text-amber-700 dark:hover:text-amber-100"
                >
                  {item.form} · {item.filingDate}
                </a>
              ) : (
                <span className="font-medium">
                  {item.form} · {item.filingDate}
                </span>
              )}
              <span> — {item.excerpt}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
