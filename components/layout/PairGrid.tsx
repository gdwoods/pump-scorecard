import type { ReactNode } from "react";

type PairGridProps = {
  first?: ReactNode;
  second?: ReactNode;
  /** Tailwind breakpoint at which the pair becomes two columns. */
  breakpoint?: "lg" | "xl";
};

/**
 * Renders two blocks side-by-side on wide viewports, stacked on narrow.
 * If only one child is provided, renders it full width without an empty column.
 */
export function PairGrid({ first, second, breakpoint = "xl" }: PairGridProps) {
  if (!first && !second) return null;

  const colClass = breakpoint === "lg" ? "lg:grid-cols-2" : "xl:grid-cols-2";

  if (first && second) {
    return (
      <div className={`grid grid-cols-1 ${colClass} gap-4 md:gap-6 items-start`}>
        {first}
        {second}
      </div>
    );
  }

  return <>{first ?? second}</>;
}
