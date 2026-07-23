/**
 * Edge Function: mi-refresh-contracts
 *
 * Runs daily at 02:00 (after Project C contract ingestion at 23:00).
 *
 * Logic:
 *   1. Fetches contracts with 75%-100% progress via RPC (filter in SQL, not in memory).
 *   2. Checks which contract_ids already exist in mi_contracts.
 *   3. Inserts only new contracts — skips existing ones.
 *   4. Purges contracts from mi_contracts that reached 100% more than 30 days ago.
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

    const now = new Date();
    const todayMs = now.getTime();
    const thirtyDaysAgoIso = new Date(todayMs - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch eligible contracts via RPC — 75%+ filter done in SQL to avoid memory issues
    const allRawContracts: any[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data: chunk, error: selectErr } = await supabase
        .rpc("get_high_progress_contracts", { min_pct: 0.75, max_pct: 999 })
        .range(from, to);

      if (selectErr) throw selectErr;

      if (chunk && chunk.length > 0) {
        allRawContracts.push(...chunk);
        hasMore = chunk.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }

    console.log(`[mi-refresh-contracts] Fetched ${allRawContracts.length} eligible contracts (75%+) from database.`);

    if (allRawContracts.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, inserted: 0, purged: 0, message: "No eligible contracts found." }),
        { status: 200, headers: CORS }
      );
    }

    // 2. Check which contract_ids already exist in mi_contracts — skip those
    const allContractIds = allRawContracts.map((c: any) => c.id);
    const existingIds = new Set<string>();

    for (let i = 0; i < allContractIds.length; i += 500) {
      const batch = allContractIds.slice(i, i + 500);
      const { data: existing } = await supabase
        .from("mi_contracts")
        .select("contract_id")
        .in("contract_id", batch);

      for (const row of existing ?? []) {
        existingIds.add(row.contract_id);
      }
    }

    console.log(`[mi-refresh-contracts] ${existingIds.size} contracts already in mi_contracts — will skip.`);

    // 3. Build rows to insert (only new contracts)
    const rowsToInsert: any[] = [];

    for (const c of allRawContracts) {
      if (existingIds.has(c.id)) continue;

      const progress = Math.min(Number(c.progress), 1.0);
      const signingMs = new Date(c.signing_date).getTime();

      let reached100At: string | null = null;
      if (progress >= 1.0) {
        const estimatedEnd = new Date(signingMs + c.execution_deadline_days * 24 * 60 * 60 * 1000);
        reached100At = estimatedEnd.toISOString();

        // Skip if reached 100% more than 30 days ago
        if (estimatedEnd.getTime() < new Date(thirtyDaysAgoIso).getTime()) {
          continue;
        }
      }

      const cleanObject = c.object
        ? c.object.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ").replace(/[ \t]+/g, " ").trim()
        : null;

      rowsToInsert.push({
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
        ingested_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      });
    }

    console.log(`[mi-refresh-contracts] Inserting ${rowsToInsert.length} new contracts...`);

    let insertedCount = 0;
    for (let i = 0; i < rowsToInsert.length; i += 500) {
      const batch = rowsToInsert.slice(i, i + 500);
      const { data: inserted, error: insertErr } = await supabase
        .from("mi_contracts")
        .insert(batch)
        .select("id");

      if (insertErr) {
        console.error("[mi-refresh-contracts] Insert batch error:", insertErr);
      } else if (inserted) {
        insertedCount += inserted.length;
      }
    }

    // 4. Purge contracts at 100% for more than 30 days
    console.log(`[mi-refresh-contracts] Purging contracts at 100% older than 30 days...`);
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

    console.log(`[mi-refresh-contracts] Job completed. Inserted: ${insertedCount}, Skipped: ${existingIds.size}, Purged: ${purgedCount}`);

    return new Response(
      JSON.stringify({
        ok: true,
        inserted: insertedCount,
        skipped: existingIds.size,
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
