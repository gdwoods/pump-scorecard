/** Droppiness gauge colors — shared by DroppinessCard, Fast verdict, score breakdown. */

export function droppinessHex(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "#6b7280"; // gray-500
  if (score >= 70) return "#16a34a"; // green-600 — spikes fade
  if (score < 40) return "#dc2626"; // red-600 — spikes hold
  return "#f59e0b"; // amber-500 — mixed
}

export function droppinessTailwindClass(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) {
    return "text-gray-600 dark:text-gray-400";
  }
  if (score >= 70) return "text-green-600 dark:text-green-400 font-semibold";
  if (score < 40) return "text-red-600 dark:text-red-400 font-semibold";
  return "text-amber-500 dark:text-amber-400 font-semibold";
}

export function parseDroppinessScoreFromText(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/^(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
