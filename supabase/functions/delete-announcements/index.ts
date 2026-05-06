/**
 * Edge Function: delete-announcements
 *
 * Deletes announcements for a date range (tenant-scoped).
 * Related notifications and announcement versions are removed by FK cascade.
 * Contracts linked to deleted announcements keep the contract and null the FK.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const MAX_RANGE_DAYS = 31;
const MIN_DATE = "2026-01-01";

function diffDaysInclusive(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.floor((to - from) / 86400000) + 1;
}

function validateDateRange(fromDate: string, toDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return "Datas invalidas. Use o formato YYYY-MM-DD.";
  }
  if (fromDate < MIN_DATE || toDate < MIN_DATE) {
    return `A limpeza manual de anuncios so permite datas a partir de ${MIN_DATE}.`;
  }
  if (fromDate > toDate) {
    return "Intervalo invalido. A data inicial tem de ser anterior ou igual a data final.";
  }
  const days = diffDaysInclusive(fromDate, toDate);
  if (days > MAX_RANGE_DAYS) {
    return `Intervalo demasiado grande para limpeza de anuncios (${days} dias). Use blocos de ate ${MAX_RANGE_DAYS} dias.`;
  }
  return null;
}

async function resolveTenantId(supabase: SupabaseClient, providedTenantId?: string): Promise<string> {
  if (providedTenantId) return providedTenantId;

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .single();

  if (error || !tenant) {
    throw new Error("No tenant found. Run admin-seed first.");
  }

  return tenant.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const fromDate: string = body.from_date ?? "";
    const toDate: string = body.to_date ?? "";
    const dryRun: boolean = body.dry_run === true;

    const rangeError = validateDateRange(fromDate, toDate);
    if (rangeError) {
      return new Response(JSON.stringify({ error: rangeError, limit_days: MAX_RANGE_DAYS }), {
        status: 400,
        headers: CORS,
      });
    }

    const supabase: SupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const tenantId = await resolveTenantId(supabase, body.tenant_id);

    let countQuery = supabase
      .from("announcements")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("publication_date", fromDate)
      .lte("publication_date", toDate);

    const { count: matchedCount, error: countErr } = await countQuery;
    if (countErr) throw countErr;

    const stats = {
      from_date: fromDate,
      to_date: toDate,
      matched_announcements: matchedCount ?? 0,
      deleted_announcements: 0,
      dry_run: dryRun,
    };

    if (!dryRun && (matchedCount ?? 0) > 0) {
      let deleteQuery = supabase
        .from("announcements")
        .delete()
        .eq("tenant_id", tenantId)
        .gte("publication_date", fromDate)
        .lte("publication_date", toDate);

      const { error: deleteErr } = await deleteQuery;
      if (deleteErr) throw deleteErr;

      stats.deleted_announcements = matchedCount ?? 0;
    }

    return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
  } catch (err) {
    console.error("[delete-announcements] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
