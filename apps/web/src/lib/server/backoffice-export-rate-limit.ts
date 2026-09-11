import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ExportRateLimitResult =
  | { ok: true; allowed: true; retryAfterSeconds: 0 }
  | { ok: true; allowed: false; retryAfterSeconds: number }
  | { ok: false; error: unknown };

export async function consumeBackofficeExportRateLimit(
  supabase: ServerSupabaseClient,
): Promise<ExportRateLimitResult> {
  const { data, error } = await supabase.rpc("consume_backoffice_export_rate_limit");
  if (error) return { ok: false, error };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed?: unknown; retry_after_seconds?: unknown }
    | null;
  if (!row || typeof row.allowed !== "boolean") {
    return { ok: false, error: new Error("Malformed export rate-limit response") };
  }

  if (row.allowed) return { ok: true, allowed: true, retryAfterSeconds: 0 };

  const retryAfterSeconds = Number(row.retry_after_seconds);
  if (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 1) {
    return { ok: false, error: new Error("Malformed export rate-limit retry value") };
  }

  return { ok: true, allowed: false, retryAfterSeconds };
}
