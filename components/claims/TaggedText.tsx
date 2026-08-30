"use client";

import { parseInlineClaimTag } from "@/lib/claims";

const TAG_STYLES: Record<string, string> = {
  verify: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  conflict: "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200",
  opinion: "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200",
};

const TAG_LABELS: Record<string, string> = {
  verify: "VERIFY",
  conflict: "CONFLICT",
  opinion: "OPINION",
};

interface TaggedTextProps {
  text: string;
  className?: string;
  /** Single-line span — for use inside list items. */
  inline?: boolean;
}

function renderSentence(sentence: string, key: string) {
  const { tag, body } = parseInlineClaimTag(sentence);
  if (tag === "verified") {
    return <span key={key}>{body}</span>;
  }
  return (
    <span key={key} className="inline">
      <span
        className={`inline-block align-baseline mr-1 px-1 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
          TAG_STYLES[tag] ?? ""
        }`}
      >
        {TAG_LABELS[tag]}
      </span>
      {body}
    </span>
  );
}

/** Renders prose with VERIFY:/CONFLICT:/OPINION: inline badges. */
export default function TaggedText({ text, className = "", inline = false }: TaggedTextProps) {
  if (inline) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    return (
      <span className={className}>
        {sentences.map((sentence, si) => (
          <span key={si}>
            {renderSentence(sentence, `s-${si}`)}
            {si < sentences.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    );
  }

  const paragraphs = text.split(/\n\n+/);
  return (
    <div className={`space-y-2 ${className}`}>
      {paragraphs.map((para, pi) => {
        const sentences = para.split(/(?<=[.!?])\s+/);
        return (
          <p key={pi} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {sentences.map((sentence, si) => (
              <span key={si}>
                {renderSentence(sentence, `p${pi}-s${si}`)}
                {si < sentences.length - 1 ? " " : ""}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
