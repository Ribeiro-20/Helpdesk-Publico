import { parseJsonArray } from "./export-csv";

export type ContractExportClassification = "ok" | "too_large" | "malformed";

export type ContractExportEnvelope<T> = {
  rows: T[];
  hasMore: boolean;
};

export function parseContractExportEnvelope<T>(data: unknown): ContractExportEnvelope<T> | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const result = data[0];
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  if (!Object.prototype.hasOwnProperty.call(result, "rows")) return null;
  if (!Object.prototype.hasOwnProperty.call(result, "has_more")) return null;

  const record = result as Record<string, unknown>;
  if (typeof record.has_more !== "boolean") return null;
  const rows = parseJsonArray<T>(record.rows);
  if (!rows) return null;
  return { rows, hasMore: record.has_more };
}

export function classifyContractExport(
  rowCount: number,
  hasMore: unknown,
  maxRows = 5000,
): ContractExportClassification {
  if (!Number.isSafeInteger(rowCount) || rowCount < 0 || typeof hasMore !== "boolean") {
    return "malformed";
  }
  return rowCount > maxRows || hasMore ? "too_large" : "ok";
}
