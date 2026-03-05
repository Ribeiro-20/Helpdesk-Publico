/**
 * Edge Function: match-and-queue
 *
 * Matches announcements against client CPV rules and creates PENDING notifications.
 *
 * Request body (all optional):
 *  {
 *    tenant_id?:       string,  // defaults to first tenant
 *    announcement_id?: string,  // if given, process only this announcement
 *                               // otherwise processes announcements from the last 2 hours
 *    hours_back?:      number   // window for "recent" announcements (default 2)
 *  }
 *
 * Response:
 *  { processed_announcements, notifications_created, notifications_skipped, errors }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { matchClientsForAnnouncement } from "../_shared/cpvMatcher.ts";
import type { CpvRule } from "../_shared/cpvMatcher.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body =
      req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Resolve tenant_id
    let tenantId: string = body.tenant_id ?? "";
    if (!tenantId) {
      const { data: tenant, error } = await supabase
        .from("tenants")
        .select("id")
        .limit(1)
        .single();
      if (error || !tenant) {
        return new Response(
          JSON.stringify({ error: "No tenant found. Run admin-seed first." }),
          { status: 400, headers: CORS },
        );
      }
      tenantId = tenant.id;
    }

    // Load CPV rules for this tenant (with active clients only)
    const { data: rules, error: rulesErr } = await supabase
      .from("client_cpv_rules")
      .select(
        "id, client_id, pattern, match_type, is_exclusion, clients!inner(is_active)",
      )
      .eq("tenant_id", tenantId);

    if (rulesErr) throw rulesErr;

    const activeRules = ((rules ?? []) as unknown as Array<
      CpvRule & { clients: { is_active: boolean } }
    >).filter((r) => r.clients?.is_active !== false) as CpvRule[];

    console.log(`[match-and-queue] ${activeRules.length} active CPV rules`);

    // Build announcement query
    let annQuery = supabase
      .from("announcements")
      .select("id, cpv_main, cpv_list")
      .eq("tenant_id", tenantId)
      .eq("status", "active");

    if (body.announcement_id) {
      annQuery = annQuery.eq("id", body.announcement_id);
    } else {
      const hoursBack = Number(body.hours_back ?? 2);
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
      annQuery = annQuery.gte("created_at", since);
    }

    const { data: announcements, error: annErr } = await annQuery;
    if (annErr) throw annErr;

    const stats = {
      processed_announcements: announcements?.length ?? 0,
      notifications_created: 0,
      notifications_skipped: 0,
      errors: 0,
    };

    for (const ann of announcements ?? []) {
      try {
        const cpvList: string[] = Array.isArray(ann.cpv_list)
          ? ann.cpv_list
          : [];
        const cpvMain: string | null = ann.cpv_main ?? null;

        const matchedClientIds = matchClientsForAnnouncement(
          cpvMain,
          cpvList,
          activeRules,
        );

        for (const clientId of matchedClientIds) {
          const { error: insertErr } = await supabase
            .from("notifications")
            .insert({
              tenant_id: tenantId,
              client_id: clientId,
              announcement_id: ann.id,
              channel: "email",
              status: "PENDING",
            });

          if (insertErr) {
            if (
              insertErr.code === "23505" // unique violation → already queued
            ) {
              stats.notifications_skipped++;
            } else {
              console.error("[match-and-queue] insert error:", insertErr);
              stats.errors++;
            }
          } else {
            stats.notifications_created++;
          }
        }
      } catch (itemErr) {
        console.error("[match-and-queue] item error:", itemErr);
        stats.errors++;
      }
    }

    console.log("[match-and-queue] done:", stats);
    return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
  } catch (err) {
    console.error("[match-and-queue] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
