/**
 * Edge Function: ingest-base
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { forEachAnnouncementsChunk, mapToAnnouncement } from "../_shared/baseApi.ts";
import { computeHash } from "../_shared/canonicalJson.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const BATCH_SIZE = 200;
const PROCESSING_CHUNK_SIZE = 250;
const MAX_RANGE_DAYS = 31;

type ExistingAnnouncement = {
  id: string;
  raw_hash: string;
  base_announcement_id: string | null;
  dr_announcement_no: string | null;
};

type MappedAnnouncement = {
  ann: ReturnType<typeof mapToAnnouncement>;
  hash: string;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function diffDaysInclusive(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.floor((to - from) / 86400000) + 1;
}

function validateDateRange(fromDate: string, toDate: string): string | null {
  const minDate = "2026-01-01";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return "Datas invalidas. Use o formato YYYY-MM-DD.";
  }
  if (fromDate < minDate || toDate < minDate) {
    return `A ingestao manual de anuncios so permite datas a partir de ${minDate}.`;
  }
  if (fromDate > toDate) {
    return "Intervalo invalido. A data inicial tem de ser anterior ou igual a data final.";
  }
  const days = diffDaysInclusive(fromDate, toDate);
  if (days > MAX_RANGE_DAYS) {
    return `Intervalo demasiado grande para anuncios (${days} dias). Use blocos de ate ${MAX_RANGE_DAYS} dias.`;
  }
  return null;
}

async function reconcileAnnouncements(
  supabase: SupabaseClient,
  tenantId: string,
  keep: ExistingAnnouncement,
  drop: ExistingAnnouncement,
): Promise<ExistingAnnouncement> {
  console.warn(
    `[ingest-base] reconciling announcements keep=${keep.id} drop=${drop.id} keep_dr=${keep.dr_announcement_no ?? "null"} drop_base=${drop.base_announcement_id ?? "null"}`,
  );

  const { data: duplicateNotifications } = await supabase
    .from("notifications")
    .select("id, client_id")
    .eq("tenant_id", tenantId)
    .eq("announcement_id", drop.id);

  if ((duplicateNotifications ?? []).length > 0) {
    const clientIds = [...new Set((duplicateNotifications ?? []).map((row: { client_id: string }) => row.client_id))];
    const { data: existingCanonicalNotifications } = await supabase
      .from("notifications")
      .select("id, client_id")
      .eq("tenant_id", tenantId)
      .eq("announcement_id", keep.id)
      .in("client_id", clientIds);

    const canonicalClientIds = new Set(
      (existingCanonicalNotifications ?? []).map((row: { client_id: string }) => row.client_id),
    );
    const duplicateNotifIdsToDelete = (duplicateNotifications ?? [])
      .filter((row: { id: string; client_id: string }) => canonicalClientIds.has(row.client_id))
      .map((row: { id: string }) => row.id);

    if (duplicateNotifIdsToDelete.length > 0) {
      await supabase
        .from("notifications")
        .delete()
        .eq("tenant_id", tenantId)
        .in("id", duplicateNotifIdsToDelete);
    }

    await supabase
      .from("notifications")
      .update({ announcement_id: keep.id })
      .eq("tenant_id", tenantId)
      .eq("announcement_id", drop.id);
  }

  await supabase
    .from("announcement_versions")
    .update({ announcement_id: keep.id })
    .eq("tenant_id", tenantId)
    .eq("announcement_id", drop.id);

  await supabase
    .from("contracts")
    .update({ announcement_id: keep.id })
    .eq("tenant_id", tenantId)
    .eq("announcement_id", drop.id);

  const mergedBaseId = keep.base_announcement_id ?? drop.base_announcement_id;
  const mergedDrNo = keep.dr_announcement_no ?? drop.dr_announcement_no;

  const { error: keepErr } = await supabase
    .from("announcements")
    .update({
      base_announcement_id: mergedBaseId,
      dr_announcement_no: mergedDrNo,
    })
    .eq("tenant_id", tenantId)
    .eq("id", keep.id);

  if (keepErr) throw keepErr;

  const { error: deleteErr } = await supabase
    .from("announcements")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", drop.id);

  if (deleteErr) throw deleteErr;

  return {
    ...keep,
    base_announcement_id: mergedBaseId,
    dr_announcement_no: mergedDrNo,
  };
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

    const stats = {
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      reconciled: 0,
      errors: 0,
      dry_run: dryRun,
      elapsed_ms: 0,
    };

    const seenIncomingByBaseId = new Map<string, string>();
    const seenIncomingByDrNo = new Map<string, string>();
    const existingByBaseId = new Map<string, ExistingAnnouncement>();
    const existingByDrNo = new Map<string, ExistingAnnouncement>();
    let processed = 0;

    const fetchedCount = await forEachAnnouncementsChunk(
      fromDate,
      toDate,
      PROCESSING_CHUNK_SIZE,
      async (rawChunk) => {
        processed += rawChunk.length;
        console.log(`[ingest-base] mapped chunk ${processed - rawChunk.length + 1}-${processed}/${processed}`);

        const mappedRaw = await Promise.all(
          rawChunk.map(async (raw) => {
            const ann = mapToAnnouncement(raw as Record<string, unknown>);
            const hash = await computeHash(ann.raw_payload, ["updated_at", "created_at", "raw_hash"]);
            return { ann, hash };
          }),
        );

        const mapped: MappedAnnouncement[] = [];
        for (const item of mappedRaw) {
          const baseHash = item.ann.base_announcement_id
            ? seenIncomingByBaseId.get(item.ann.base_announcement_id)
            : undefined;
          const drHash = item.ann.dr_announcement_no
            ? seenIncomingByDrNo.get(item.ann.dr_announcement_no)
            : undefined;

          const conflictingIncoming =
            (baseHash && drHash && baseHash !== drHash) ||
            (baseHash && baseHash !== item.hash) ||
            (drHash && drHash !== item.hash);

          if (conflictingIncoming) {
            console.warn(
              `[ingest-base] skipping ambiguous incoming announcement base_id=${item.ann.base_announcement_id ?? "null"} dr_no=${item.ann.dr_announcement_no ?? "null"}`,
            );
            stats.skipped++;
            continue;
          }

          if (baseHash || drHash) {
            stats.skipped++;
            continue;
          }

          mapped.push(item);
          if (item.ann.base_announcement_id) seenIncomingByBaseId.set(item.ann.base_announcement_id, item.hash);
          if (item.ann.dr_announcement_no) seenIncomingByDrNo.set(item.ann.dr_announcement_no, item.hash);
        }

        if (mapped.length === 0) {
          console.log(`[ingest-base] progress ${processed} inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} reconciled=${stats.reconciled}`);
          return;
        }

        const baseIdsToFetch = [...new Set(
          mapped
            .map((m) => m.ann.base_announcement_id)
            .filter((id): id is string => Boolean(id) && !existingByBaseId.has(id as string)),
        )];
        const drNosToFetch = [...new Set(
          mapped
            .map((m) => m.ann.dr_announcement_no)
            .filter((id): id is string => Boolean(id) && !existingByDrNo.has(id as string)),
        )];

        for (let i = 0; i < baseIdsToFetch.length; i += 500) {
          const chunk = baseIdsToFetch.slice(i, i + 500);
          const { data } = await supabase
            .from("announcements")
            .select("id, base_announcement_id, dr_announcement_no, raw_hash")
            .eq("tenant_id", tenantId)
            .in("base_announcement_id", chunk);
          (data ?? []).forEach((row: ExistingAnnouncement) => {
            if (row.base_announcement_id) existingByBaseId.set(row.base_announcement_id, row);
            if (row.dr_announcement_no) existingByDrNo.set(row.dr_announcement_no, row);
          });
        }

        for (let i = 0; i < drNosToFetch.length; i += 500) {
          const chunk = drNosToFetch.slice(i, i + 500);
          const { data } = await supabase
            .from("announcements")
            .select("id, base_announcement_id, dr_announcement_no, raw_hash")
            .eq("tenant_id", tenantId)
            .in("dr_announcement_no", chunk);
          (data ?? []).forEach((row: ExistingAnnouncement) => {
            if (row.base_announcement_id) existingByBaseId.set(row.base_announcement_id, row);
            if (row.dr_announcement_no) existingByDrNo.set(row.dr_announcement_no, row);
          });
        }

        const toInsert: MappedAnnouncement[] = [];
        const toUpdate: Array<MappedAnnouncement & { existingId: string; previousHash: string }> = [];

        for (const item of mapped) {
          let existingByBase = item.ann.base_announcement_id
            ? existingByBaseId.get(item.ann.base_announcement_id)
            : undefined;
          let existingByDr = item.ann.dr_announcement_no
            ? existingByDrNo.get(item.ann.dr_announcement_no)
            : undefined;

          if (existingByBase && existingByDr && existingByBase.id !== existingByDr.id) {
            const canonical = await reconcileAnnouncements(supabase, tenantId, existingByDr, existingByBase);
            stats.reconciled++;
            existingByBase = canonical;
            existingByDr = canonical;
            if (canonical.base_announcement_id) existingByBaseId.set(canonical.base_announcement_id, canonical);
            if (canonical.dr_announcement_no) existingByDrNo.set(canonical.dr_announcement_no, canonical);
          }

          const existing = existingByDr ?? existingByBase;
          if (!existing) {
            toInsert.push(item);
          } else if (existing.raw_hash !== item.hash) {
            toUpdate.push({ ...item, existingId: existing.id, previousHash: existing.raw_hash });
          } else {
            stats.skipped++;
          }
        }

        if (!dryRun) {
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

            const { data, error } = await supabase
              .from("announcements")
              .insert(batch)
              .select("id, base_announcement_id, dr_announcement_no, raw_hash");

            if (error) {
              console.error(`[ingest-base] insert batch ${i / BATCH_SIZE + 1} error:`, error.message, error.details, error.hint, error.code);
              if (batch.length > 0) {
                const sample = batch[0];
                console.error("[ingest-base] sample:", sample.base_announcement_id, sample.dr_announcement_no, sample.publication_date);
              }
              stats.errors += batch.length;
            } else {
              stats.inserted += batch.length;
              (data ?? []).forEach((row: ExistingAnnouncement) => {
                if (row.base_announcement_id) existingByBaseId.set(row.base_announcement_id, row);
                if (row.dr_announcement_no) existingByDrNo.set(row.dr_announcement_no, row);
              });
            }
          }

          for (const { ann, hash, existingId, previousHash } of toUpdate) {
            const { error } = await supabase
              .from("announcements")
              .update({
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
                cpv_main: ann.cpv_main,
                cpv_list: ann.cpv_list,
                proposal_deadline_days: ann.proposal_deadline_days,
                proposal_deadline_at: ann.proposal_deadline_at,
                detail_url: ann.detail_url,
                raw_payload: ann.raw_payload,
                raw_hash: hash,
              })
              .eq("id", existingId);

            if (error) {
              console.error("[ingest-base] update error:", error.message, existingId);
              stats.errors++;
            } else {
              await supabase.from("announcement_versions").insert({
                tenant_id: tenantId,
                announcement_id: existingId,
                raw_payload: ann.raw_payload,
                raw_hash: hash,
                change_summary: { previous_hash: previousHash, reason: "changed" },
              });
              stats.updated++;

              const updatedRow: ExistingAnnouncement = {
                id: existingId,
                raw_hash: hash,
                base_announcement_id: ann.base_announcement_id,
                dr_announcement_no: ann.dr_announcement_no,
              };
              if (updatedRow.base_announcement_id) existingByBaseId.set(updatedRow.base_announcement_id, updatedRow);
              if (updatedRow.dr_announcement_no) existingByDrNo.set(updatedRow.dr_announcement_no, updatedRow);
            }
          }
        } else {
          stats.inserted += toInsert.length;
          stats.updated += toUpdate.length;
        }

        console.log(`[ingest-base] progress ${processed} inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} reconciled=${stats.reconciled}`);
      },
    );

    stats.fetched = fetchedCount;
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
