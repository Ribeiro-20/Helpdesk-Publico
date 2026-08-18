const ACT_TYPE_ALIASES: Record<string, string> = {
  "Anúncio de procedimento": "Anuncio de procedimento",
};
const ACT_TYPE_LABELS = Object.fromEntries(
  Object.entries(ACT_TYPE_ALIASES).map(([label, value]) => [value, label]),
) as Record<string, string>;

export function normalizeActTypeFilter(value: string): string {
  return ACT_TYPE_ALIASES[value] ?? value;
}

export function displayActTypeFilter(value: string): string {
  return ACT_TYPE_LABELS[value] ?? value;
}

export function reconcileMarketDateEnd(nextStart: string, currentEnd: string): string {
  if (!currentEnd || !nextStart || currentEnd >= nextStart) return currentEnd;
  return nextStart;
}
