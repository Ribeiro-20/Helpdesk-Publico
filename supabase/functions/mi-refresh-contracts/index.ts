/**
 * Edge Function: mi-refresh-contracts
 * 
 * Runs daily at 02:00 (after Project C contract ingestion at 23:00).
 * 
 * Responsibilities:
 *   1. Queries active contracts from 'contracts' with execution progress between 75% and 100%.
 *   2. Upserts matching records into 'mi_contracts' table.
 *   3. Populates 'reached_100_at' when a contract hits 100% progress.
 *   4. Purges contracts from 'mi_contracts' that reached 100% more than 30 days ago.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    console.log("[mi-refresh-contracts] Starting 02:00 Market Intelligence refresh job...");

    // 1. Fetch active contracts with valid signing dates and execution deadlines using pagination
    const allRawContracts: any[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data: chunk, error: selectErr } = await supabase
        .from("contracts")
        .select("id, object, contracting_entities, winners, contract_price, signing_date, execution_deadline_days, cpv_main, status, created_at")
        .eq("status", "active")
        .not("signing_date", "is", null)
        .not("execution_deadline_days", "is", null)
        .gt("execution_deadline_days", 0)
        .range(from, to);

      if (selectErr) throw selectErr;

      if (chunk && chunk.length > 0) {
        allRawContracts.push(...chunk);
        if (chunk.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    const rawContracts = allRawContracts;
    console.log(`[mi-refresh-contracts] Scanned ${rawContracts.length} total active contracts from database.`);

    const now = new Date();
    const todayMs = now.getTime();
    const thirtyDaysAgoIso = new Date(todayMs - 30 * 24 * 60 * 60 * 1000).toISOString();

    const miRowsToUpsert: any[] = [];

    for (const c of rawContracts ?? []) {
      const signingMs = new Date(c.signing_date).getTime();
      const elapsedDays = (todayMs - signingMs) / (24 * 60 * 60 * 1000);
      const rawProgress = elapsedDays / c.execution_deadline_days;

      // Filter: only contracts between 75% (0.75) and 100% (1.0)
      if (rawProgress < 0.75) continue;

      const progress = Math.min(Math.round(rawProgress * 10000) / 10000, 1.0);

      // Check if 100% reached
      let reached100At: string | null = null;
      if (progress >= 1.0) {
        const estimatedEnd = new Date(signingMs + c.execution_deadline_days * 24 * 60 * 60 * 1000);
        reached100At = estimatedEnd.toISOString();

        // Exclude if reached 100% more than 30 days ago
        if (estimatedEnd.getTime() < new Date(thirtyDaysAgoIso).getTime()) {
          continue;
        }
      }

      const cleanObject = c.object
        ? c.object
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ")
            .replace(/[\u00AD\u200B-\u200D\u200E\u200F\uFEFF\uFFFD\u001C-\u001F]/g, "")
            .replace(/[ \t]+/g, " ")
            .trim()
        : null;

      miRowsToUpsert.push({
        contract_id: c.id,
        object: cleanObject,
        contracting_entities: c.contracting_entities,
        winners: c.winners,
        contract_price: c.contract_price,
        signing_date: c.signing_date,
        execution_deadline_days: c.execution_deadline_days,
        cpv_main: c.cpv_main,
        progress,
        reached_100_at: reached100At,
        ingested_at: c.created_at,
        last_updated_at: new Date().toISOString(),
      });
    }

    console.log(`[mi-refresh-contracts] Found ${miRowsToUpsert.length} eligible contracts (75-100%). Upserting...`);

    let upsertedCount = 0;
    if (miRowsToUpsert.length > 0) {
      // Chunk upserts in batches of 500 for safety
      const chunkSize = 500;
      for (let i = 0; i < miRowsToUpsert.length; i += chunkSize) {
        const chunk = miRowsToUpsert.slice(i, i + chunkSize);
        const { data: upsertData, error: upsertErr } = await supabase
          .from("mi_contracts")
          .upsert(chunk, { onConflict: "contract_id" })
          .select("id");

        if (upsertErr) {
          console.error("[mi-refresh-contracts] Upsert batch error:", upsertErr);
        } else if (upsertData) {
          upsertedCount += upsertData.length;
        }
      }
    }

    // 2. Purge contracts that have been at 100% for more than 30 days
    console.log(`[mi-refresh-contracts] Purging contracts at 100% older than ${thirtyDaysAgoIso}...`);
    const { data: deletedData, error: deleteErr } = await supabase
      .from("mi_contracts")
      .delete()
      .not("reached_100_at", "is", null)
      .lt("reached_100_at", thirtyDaysAgoIso)
      .select("id");

    const purgedCount = deletedData ? deletedData.length : 0;
    if (deleteErr) {
      console.error("[mi-refresh-contracts] Purge error:", deleteErr);
    }

    console.log(`[mi-refresh-contracts] Job completed. Upserted: ${upsertedCount}, Purged: ${purgedCount}`);

    return new Response(
      JSON.stringify({
        ok: true,
        upserted: upsertedCount,
        purged: purgedCount,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: CORS }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[mi-refresh-contracts] Error:", errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), { status: 500, headers: CORS });
  }
});
