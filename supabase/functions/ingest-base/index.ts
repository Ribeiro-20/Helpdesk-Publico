/**
 * Edge Function: ingest-base
 *
 * Fetches announcements from BASE API for a date range and upserts them
 * into the announcements table using batch operations.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { listAllAnnouncements, mapToAnnouncement } from "../_shared/baseApi.ts";
import { computeHash } from "../_shared/canonicalJson.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const BATCH_SIZE = 200;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const startedAt = Date.now();

  try {
    const body = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : {};

    const today = new Date();
    const minus2 = new Date(today);
    minus2.setDate(minus2.getDate() - 2);

    const fromDate: string = body.from_date ?? isoDate(minus2);
    const toDate: string = body.to_date ?? isoDate(today);
    const dryRun: boolean = body.dry_run === true;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Resolve tenant_id
    let tenantId: string = body.tenant_id ?? "";
    if (!tenantId) {
      const { data: tenant, error } = await supabase
        .from("tenants").select("id").limit(1).single();
      if (error || !tenant) {
        return new Response(
          JSON.stringify({ error: "No tenant found. Run admin-seed first." }),
          { status: 400, headers: CORS },
        );
      }
      tenantId = tenant.id;
    }

    console.log(`[ingest-base] tenant=${tenantId} from=${fromDate} to=${toDate} dry_run=${dryRun}`);

    // 1. Fetch from BASE API
    const rawItems = await listAllAnnouncements(fromDate, toDate);
    console.log(`[ingest-base] fetched ${rawItems.length} items`);

    const stats = {
      fetched: rawItems.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      dry_run: dryRun,
      elapsed_ms: 0,
    };

    if (dryRun || rawItems.length === 0) {
      if (dryRun) stats.inserted = rawItems.length;
      stats.elapsed_ms = Date.now() - startedAt;
      return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
    }

    // 2. Map + hash all items
    const mapped = await Promise.all(
      rawItems.map(async (raw) => {
        const ann = mapToAnnouncement(raw as Record<string, unknown>);
        const hash = await computeHash(ann.raw_payload, ["updated_at", "created_at", "raw_hash"]);
        return { ann, hash };
      }),
    );

    // 3. Load existing hashes in bulk for deduplication
    const incmIds = mapped
      .map((m) => m.ann.base_announcement_id)
      .filter(Boolean) as string[];

    const existingMap = new Map<string, { id: string; hash: string }>();

    for (let i = 0; i < incmIds.length; i += 500) {
      const chunk = incmIds.slice(i, i + 500);
      const { data } = await supabase
        .from("announcements")
        .select("id, base_announcement_id, raw_hash")
        .eq("tenant_id", tenantId)
        .in("base_announcement_id", chunk);
      (data ?? []).forEach((row) => {
        existingMap.set(row.base_announcement_id, { id: row.id, hash: row.raw_hash });
      });
    }

    // 4. Split into new vs changed
    const toInsert: typeof mapped = [];
    const toUpdate: typeof mapped = [];

    for (const item of mapped) {
      const existing = item.ann.base_announcement_id
        ? existingMap.get(item.ann.base_announcement_id)
        : undefined;

      if (!existing) {
        toInsert.push(item);
      } else if (existing.hash !== item.hash) {
        toUpdate.push(item);
      } else {
        stats.skipped++;
      }
    }

    // 5. Batch insert new announcements
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE).map(({ ann, hash }) => ({
        tenant_id: tenantId,
        source: "BASE_API",
        base_announcement_id: ann.base_announcement_id,
        dr_announcement_no: ann.dr_announcement_no,
        publication_date: ann.publication_date,
        title: ann.title,
        description: ann.description,
        entity_name: ann.entity_name,
        entity_nif: ann.entity_nif,
        procedure_type: ann.procedure_type,
        act_type: ann.act_type,
        contract_type: ann.contract_type,
        base_price: ann.base_price,
        currency: ann.currency,
        cpv_main: ann.cpv_main,
        cpv_list: ann.cpv_list,
        proposal_deadline_days: ann.proposal_deadline_days,
        proposal_deadline_at: ann.proposal_deadline_at,
        detail_url: ann.detail_url,
        raw_payload: ann.raw_payload,
        raw_hash: hash,
      }));

      const { error } = await supabase.from("announcements").insert(batch);
      if (error) {
        console.error("[ingest-base] insert batch error:", error.message);
        stats.errors += batch.length;
      } else {
        stats.inserted += batch.length;
      }
    }

    // 6. Batch update changed announcements
    for (const { ann, hash } of toUpdate) {
      const existing = existingMap.get(ann.base_announcement_id!);
      if (!existing) continue;

      const { error } = await supabase
        .from("announcements")
        .update({
          title: ann.title,
          description: ann.description,
          entity_name: ann.entity_name,
          procedure_type: ann.procedure_type,
          act_type: ann.act_type,
          contract_type: ann.contract_type,
          base_price: ann.base_price,
          cpv_main: ann.cpv_main,
          cpv_list: ann.cpv_list,
          proposal_deadline_days: ann.proposal_deadline_days,
          proposal_deadline_at: ann.proposal_deadline_at,
          detail_url: ann.detail_url,
          raw_payload: ann.raw_payload,
          raw_hash: hash,
        })
        .eq("id", existing.id);

      if (error) {
        stats.errors++;
      } else {
        // Record version
        await supabase.from("announcement_versions").insert({
          tenant_id: tenantId,
          announcement_id: existing.id,
          raw_payload: ann.raw_payload,
          raw_hash: hash,
          change_summary: { previous_hash: existing.hash, reason: "changed" },
        });
        stats.updated++;
      }
    }

    stats.elapsed_ms = Date.now() - startedAt;
    console.log("[ingest-base] done:", stats);

    return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
  } catch (err) {
    console.error("[ingest-base] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
