function numericCell(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value).replace(".", ",");
}

export const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export function parseJsonArray<T>(value: unknown): T[] | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export function safeSpreadsheetCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return numericCell(value);
  const text = String(value);
  return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function escapeCell(value: unknown): string {
  const safe = safeSpreadsheetCell(value);
  if (!/[;"\r\n]/.test(safe)) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildSemicolonCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(";"));
  return `\ufeff${lines.join("\r\n")}\r\n`;
}
