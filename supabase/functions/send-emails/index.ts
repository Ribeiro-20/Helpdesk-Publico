/**
 * Edge Function: send-emails
 *
 * Processes PENDING notifications in batches, sends emails, and marks them
 * as SENT or FAILED.
 *
 * Request body (all optional):
 *  {
 *    tenant_id?:     string,  // defaults to first tenant
 *    batch_size?:    number   // notifications per run (default 50)
 *  }
 *
 * Response:
 *  { processed, sent, failed, errors }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildAnnouncementEmail,
  createEmailProvider,
} from "../_shared/emailProvider.ts";

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

    const batchSize = Number(body.batch_size ?? 50);
    const appBaseUrl =
      Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000";

    // Fetch PENDING notifications with related data
    const { data: notifications, error: fetchErr } = await supabase
      .from("notifications")
      .select(
        `
        id,
        client_id,
        announcement_id,
        clients (
          name,
          email,
          is_active,
          max_emails_per_day
        ),
        announcements (
          title,
          entity_name,
          publication_date,
          cpv_main,
          base_price,
          currency,
          detail_url
        )
      `,
      )
      .eq("tenant_id", tenantId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (fetchErr) throw fetchErr;

    const emailProvider = createEmailProvider();

    const stats = { processed: 0, sent: 0, failed: 0, errors: 0 };

    for (const notif of notifications ?? []) {
      stats.processed++;

      const client = (notif as Record<string, unknown>).clients as {
        name: string;
        email: string;
        is_active: boolean;
        max_emails_per_day: number;
      } | null;

      const announcement = (notif as Record<string, unknown>)
        .announcements as {
        title: string;
        entity_name: string | null;
        publication_date: string;
        cpv_main: string | null;
        base_price: number | null;
        currency: string;
        detail_url: string | null;
      } | null;

      if (!client || !announcement) {
        await supabase
          .from("notifications")
          .update({ status: "FAILED", error: "Missing client or announcement" })
          .eq("id", notif.id);
        stats.failed++;
        continue;
      }

      if (!client.is_active) {
        await supabase
          .from("notifications")
          .update({ status: "SKIPPED", error: "Client inactive" })
          .eq("id", notif.id);
        stats.processed--;
        continue;
      }

      try {
        const { subject, html, text } = buildAnnouncementEmail({
          clientName: client.name,
          title: announcement.title,
          entityName: announcement.entity_name,
          publicationDate: announcement.publication_date,
          cpvMain: announcement.cpv_main,
          basePrice: announcement.base_price,
          currency: announcement.currency,
          detailUrl: announcement.detail_url,
          appBaseUrl,
        });

        const result = await emailProvider.send({
          to: client.email,
          subject,
          html,
          text,
        });

        if (result.success) {
          await supabase
            .from("notifications")
            .update({ status: "SENT", sent_at: new Date().toISOString() })
            .eq("id", notif.id);
          stats.sent++;
        } else {
          await supabase
            .from("notifications")
            .update({ status: "FAILED", error: result.error ?? "Unknown" })
            .eq("id", notif.id);
          stats.failed++;
        }
      } catch (sendErr) {
        console.error("[send-emails] send error:", sendErr);
        await supabase
          .from("notifications")
          .update({ status: "FAILED", error: String(sendErr) })
          .eq("id", notif.id);
        stats.failed++;
        stats.errors++;
      }
    }

    console.log("[send-emails] done:", stats);
    return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
  } catch (err) {
    console.error("[send-emails] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
