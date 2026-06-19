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

function isAnnouncementExpired(deadlineAt: string | null | undefined): boolean {
  if (!deadlineAt) return false;

  const deadlineMs = Date.parse(deadlineAt);
  if (!Number.isFinite(deadlineMs)) return false;

  return deadlineMs < Date.now();
}

Deno.serve(async (req: Request) => {
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
      Deno.env.get("APP_BASE_URL") ?? "http://localhost:3001";

    // Fetch PENDING notifications with related data
    const { data: notifications, error: fetchErr } = await supabase
      .from("notifications")
      .select(`
        id,
        client_id,
        announcement_id,
        clients (
          name,
          email,
          is_active,
          max_emails_per_day
        ),
        announcements (*)
      `)
      .eq("tenant_id", tenantId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (fetchErr) throw fetchErr;

    const cpvCodes = Array.from(new Set(
      (notifications ?? [])
        .map((notif) => {
          const ann = (notif as Record<string, unknown>).announcements as Record<string, unknown> | null;
          return ann && typeof ann.cpv_main === "string" ? ann.cpv_main.trim() : "";
        })
        .filter((code): code is string => Boolean(code)),
    ));

    const cpvDescriptionMap = new Map<string, string>();
    if (cpvCodes.length > 0) {
      const { data: cpvRows, error: cpvErr } = await supabase
        .from("cpv_codes")
        .select("id, descricao")
        .in("id", cpvCodes);

      if (cpvErr) {
        console.warn("[send-emails] could not load CPV descriptions:", cpvErr);
      } else {
        for (const row of cpvRows ?? []) {
          const item = row as { id?: unknown; descricao?: unknown };
          const code = typeof item.id === "string" ? item.id.trim() : "";
          const description = typeof item.descricao === "string" ? item.descricao.trim() : "";
          if (code && description) cpvDescriptionMap.set(code, description);
        }
      }
    }

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
        cpv_description?: string | null;
        base_price: number | null;
        currency: string;
        detail_url: string | null;
        proposal_deadline_at?: string | null;
      } | null;

      if (!client || !announcement) {
        await supabase
          .from("notifications")
          .update({ status: "FAILED", error: "Missing client or announcement" })
          .eq("id", notif.id);
        stats.failed++;
        continue;
      }

      if (isAnnouncementExpired(announcement.proposal_deadline_at ?? null)) {
        await supabase
          .from("notifications")
          .update({
            status: "SKIPPED",
            error: "Announcement deadline expired",
          })
          .eq("id", notif.id);
        stats.processed--;
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
        const cpvDescription = announcement.cpv_main
          ? cpvDescriptionMap.get(announcement.cpv_main) ?? null
          : null;

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
          announcement: {
            ...(announcement as Record<string, unknown>),
            cpv_description: cpvDescription,
          },
        });

          // Try to fetch the PDF version of the announcement and attach it
          const attachments: Array<{ name: string; content: string; contentType?: string }> = [];
          try {
            const pdfUrl = `${appBaseUrl.replace(/\/$/,"")}/api/announcements/${notif.announcement_id}/pdf`;
            const pdfRes = await fetch(pdfUrl);
            if (pdfRes.ok) {
              const arr = await pdfRes.arrayBuffer();
              // convert ArrayBuffer to base64 (Deno-friendly)
              const bytes = new Uint8Array(arr);
              let binary = "";
              const chunkSize = 0x8000; // 32KB chunks
              for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.subarray(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, Array.from(chunk));
              }
              const b64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
              const filename = `anuncio-${String(notif.announcement_id)}.pdf`;
              attachments.push({ name: filename, content: b64, contentType: "application/pdf" });
            } else {
              console.warn(`[send-emails] could not fetch pdf (${pdfRes.status}) for announcement ${notif.announcement_id}`);
            }
          } catch (e) {
            console.warn("[send-emails] error fetching announcement pdf:", e);
          }

          const result = await emailProvider.send({
            to: client.email,
            subject,
            html,
            text,
            ...(attachments.length > 0 ? { attachments } : {}),
          });

        if (result.success) {
          await supabase
            .from("notifications")
            .update({ status: "SENT", sent_at: new Date().toISOString() })
            .eq("id", notif.id);

          // record email history
          try {
            await supabase.from("email_histories").insert({
              tenant_id: tenantId,
              notification_id: notif.id,
              subject,
              html,
              text,
              payload: { subject, html, text, client, announcement, delivery: { provider: result.provider, messageId: result.messageId, details: result.details } },
              status: "SENT",
            });
          } catch (e) {
            console.error("[send-emails] could not insert email_history:", e);
          }

          stats.sent++;
        } else {
          await supabase
            .from("notifications")
            .update({ status: "FAILED", error: result.error ?? "Unknown" })
            .eq("id", notif.id);

          try {
            await supabase.from("email_histories").insert({
              tenant_id: tenantId,
              notification_id: notif.id,
              subject,
              html,
              text,
              payload: { subject, html, text, client, announcement, delivery: { provider: result.provider, messageId: result.messageId, details: result.details } },
              status: "FAILED",
              error: result.error ?? null,
            });
          } catch (e) {
            console.error("[send-emails] could not insert email_history:", e);
          }

          stats.failed++;
        }
      } catch (sendErr) {
        console.error("[send-emails] send error:", sendErr);
        await supabase
          .from("notifications")
          .update({ status: "FAILED", error: String(sendErr) })
          .eq("id", notif.id);

        try {
          await supabase.from("email_histories").insert({
            tenant_id: tenantId,
            notification_id: notif.id,
            subject: null,
            html: null,
            text: null,
            payload: { error: String(sendErr), client, announcement },
            status: "FAILED",
            error: String(sendErr),
          });
        } catch (e) {
          console.error("[send-emails] could not insert email_history:", e);
        }

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
