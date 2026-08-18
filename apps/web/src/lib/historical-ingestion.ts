export type HistoricalWindow = { from: string; to: string };

function parseIsoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Data histórica inválida: ${value}`);
  }
  return date;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function buildHistoricalWindows(from: string, to: string, days = 15): HistoricalWindow[] {
  if (!Number.isInteger(days) || days < 1 || days > 31) throw new Error("Janela histórica inválida.");
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (start > end) throw new Error("Intervalo histórico inválido.");

  const windows: HistoricalWindow[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const windowEnd = new Date(cursor);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + days - 1);
    if (windowEnd > end) windowEnd.setTime(end.getTime());
    windows.push({ from: isoDate(cursor), to: isoDate(windowEnd) });
    cursor = new Date(windowEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return windows;
}

export function historicalProgress(completedWindows: number, totalWindows: number): number {
  if (!Number.isFinite(totalWindows) || totalWindows <= 0) return 0;
  const ratio = Math.max(0, Math.min(completedWindows, totalWindows)) / totalWindows;
  return Math.round(ratio * 100);
}
