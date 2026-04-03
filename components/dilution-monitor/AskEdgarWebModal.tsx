"use client";

import { useEffect } from "react";

type Props = {
  url: string | null;
  onClose: () => void;
};

export default function AskEdgarWebModal({ url, onClose }: Props) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  useEffect(() => {
    if (url) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [url]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label="Ask Edgar"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex flex-col w-full max-w-[1200px] h-[min(92vh,900px)] rounded-lg border border-[#30363d] bg-[#161b22] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#30363d] bg-[#0d1117] shrink-0">
          <span className="text-xs sm:text-sm font-mono text-[#8b949e] truncate flex-1 min-w-0">
            {url}
          </span>
          <div className="flex gap-2 shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1.5 rounded border border-[#30363d] text-[#58a6ff] hover:bg-[#21262d] whitespace-nowrap"
            >
              New tab
            </a>
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-2 py-1.5 rounded bg-[#21262d] text-[#e6edf3] hover:bg-[#30363d] whitespace-nowrap"
            >
              Close
            </button>
          </div>
        </div>
        <iframe
          title="Ask Edgar"
          src={url}
          className="flex-1 w-full min-h-0 border-0 bg-[#0d1117]"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <p className="text-[10px] text-[#6e7681] px-2 py-1.5 border-t border-[#30363d] bg-[#0d1117]">
          If this stays blank, the site may block embedding—use &quot;New tab&quot;.
        </p>
      </div>
    </div>
  );
}
