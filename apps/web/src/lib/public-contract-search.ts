import { parseJsonArray } from "./export-csv";

export const MAX_PUBLIC_CONTRACT_PAGE = 100000;

export type PublicContractSearchEnvelope<T> = {
  rows: T[];
  totalCount: number | null;
  hasMore: boolean;
};

export function parsePublicContractPage(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== "string") return 1;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return 1;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_PUBLIC_CONTRACT_PAGE);
}

export function parsePublicContractEnvelope<T>(
  value: unknown,
): PublicContractSearchEnvelope<T> | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const result = value[0];
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;

  const record = result as Record<string, unknown>;
  const rows = parseJsonArray<T>(record.rows);
  if (!rows || typeof record.has_more !== "boolean") return null;

  let totalCount: number | null = null;
  if (record.total_count !== null && record.total_count !== undefined) {
    const rawTotal = record.total_count;
    if (
      typeof rawTotal !== "number" &&
      !(typeof rawTotal === "string" && /^\d+$/.test(rawTotal))
    ) {
      return null;
    }
    const parsedTotal = Number(rawTotal);
    if (!Number.isSafeInteger(parsedTotal) || parsedTotal < 0) return null;
    totalCount = parsedTotal;
  }

  return { rows, totalCount, hasMore: record.has_more };
}

export async function loadFirstPublicContractPage<T>(
  loadPage: (page: number) => Promise<PublicContractSearchEnvelope<T> | null>,
): Promise<{ page: number; result: PublicContractSearchEnvelope<T> } | null> {
  const firstPage = await loadPage(1);
  return firstPage ? { page: 1, result: firstPage } : null;
}
