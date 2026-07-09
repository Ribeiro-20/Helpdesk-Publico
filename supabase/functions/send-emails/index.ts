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
  buildAnnouncementEmailOutlook,
  createEmailProvider,
} from "../_shared/emailProvider.ts";
import {
  getLisbonDayRangeUtc,
  getNextBusinessDay10am,
} from "../_shared/scheduling.ts";

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

function selectEmailBuilder(recipientEmail: string): typeof buildAnnouncementEmail {
  // Use div-based version for Gmail (best rendering)
  if (recipientEmail.toLowerCase().includes("@gmail.com")) {
    return buildAnnouncementEmail;
  }
  // Use table-based version for Outlook and others (Outlook-compatible)
  return buildAnnouncementEmailOutlook;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body =
      req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const sendEnabled = (Deno.env.get("EMAIL_SEND_ENABLED") ?? "false")
      .trim()
      .toLowerCase() === "true";

    if (!sendEnabled) {
      return new Response(
        JSON.stringify({
          disabled: true,
          claimed: 0,
          processed: 0,
          sent: 0,
          failed: 0,
          skipped: 0,
          rate_limited: 0,
          errors: 0,
          message:
            "Email sending is disabled. Set EMAIL_SEND_ENABLED=true to enable it.",
        }),
        { status: 200, headers: CORS },
      );
    }

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

    const requestedBatchSize = Number(body.batch_size ?? 50);
    const batchSize = Number.isFinite(requestedBatchSize)
      ? Math.min(Math.max(Math.floor(requestedBatchSize), 1), 50)
      : 50;
    const appBaseUrl =
      Deno.env.get("APP_BASE_URL") ?? "http://localhost:3001";

    const nowIso = new Date().toISOString();

    // Fetch due notification ids first, then claim them atomically.
    const { data: dueRows, error: dueErr } = await supabase
      .from("notifications")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "PENDING")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (dueErr) throw dueErr;

    const dueIds = (dueRows ?? []).map((row: { id: string }) => row.id);

    const stats = {
      claimed: 0,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      rate_limited: 0,
      errors: 0,
    };

    if (dueIds.length === 0) {
      return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
    }

    const { data: claimedRows, error: claimErr } = await supabase
      .from("notifications")
      .update({ status: "PROCESSING", error: null })
      .eq("tenant_id", tenantId)
      .eq("status", "PENDING")
      .in("id", dueIds)
      .select("id");

    if (claimErr) throw claimErr;

    const claimedIds = (claimedRows ?? []).map((row: { id: string }) => row.id);
    stats.claimed = claimedIds.length;

    if (claimedIds.length === 0) {
      return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
    }

    // Load claimed rows with related data for email generation.
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
      .eq("status", "PROCESSING")
      .in("id", claimedIds)
      .order("created_at", { ascending: true });

    if (fetchErr) throw fetchErr;

    const { startIso, endIso } = getLisbonDayRangeUtc(new Date());
    const claimedClientIds = Array.from(new Set(
      (notifications ?? [])
        .map((notif) => String((notif as Record<string, unknown>).client_id ?? ""))
        .filter(Boolean),
    ));

    const sentTodayByClient = new Map<string, number>();
    if (claimedClientIds.length > 0) {
      const { data: sentTodayRows, error: sentTodayErr } = await supabase
        .from("notifications")
        .select("client_id")
        .eq("tenant_id", tenantId)
        .eq("status", "SENT")
        .gte("sent_at", startIso)
        .lt("sent_at", endIso)
        .in("client_id", claimedClientIds);

      if (sentTodayErr) {
        console.warn("[send-emails] could not load today's sent counters:", sentTodayErr);
      } else {
        for (const row of sentTodayRows ?? []) {
          const clientId = String((row as Record<string, unknown>).client_id ?? "");
          if (!clientId) continue;
          sentTodayByClient.set(clientId, (sentTodayByClient.get(clientId) ?? 0) + 1);
        }
      }
    }

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

    for (const notif of notifications ?? []) {
      stats.processed++;

      const client = (notif as Record<string, unknown>).clients as {
        name: string;
        email: string;
        is_active: boolean;
        max_emails_per_day: number;
      } | null;
      const clientId = String((notif as Record<string, unknown>).client_id ?? "");

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
          .eq("id", notif.id)
          .eq("status", "PROCESSING");
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
          .eq("id", notif.id)
          .eq("status", "PROCESSING");
        stats.skipped++;
        continue;
      }

      const maxEmailsPerDay = Number(client.max_emails_per_day ?? 0);
      const sentToday = sentTodayByClient.get(clientId) ?? 0;
      if (Number.isFinite(maxEmailsPerDay) && maxEmailsPerDay >= 0 && sentToday >= maxEmailsPerDay) {
        const postponedTo = getNextBusinessDay10am(new Date());
        await supabase
          .from("notifications")
          .update({
            status: "PENDING",
            scheduled_for: postponedTo,
            error: `Rate limit reached (${maxEmailsPerDay}/day); postponed`,
          })
          .eq("id", notif.id)
          .eq("status", "PROCESSING");

        try {
          await supabase.from("email_histories").insert({
            tenant_id: tenantId,
            notification_id: notif.id,
            status: "RATE_LIMITED",
            payload: { client, announcement, postponed_to: postponedTo },
            error: `Rate limit reached (${maxEmailsPerDay}/day)`,
          });
        } catch (e) {
          console.error("[send-emails] could not insert email_history for rate limit:", e);
        }

        stats.rate_limited++;
        continue;
      }

      try {
        const cpvDescription = announcement.cpv_main
          ? cpvDescriptionMap.get(announcement.cpv_main) ?? null
          : null;

        // Choose the appropriate email builder based on recipient email domain
        const emailBuilder = selectEmailBuilder(client.email);

        const { subject, html, text } = emailBuilder({
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
          const pdfUrl = `${appBaseUrl.replace(/\/$/, "")}/api/announcements/${notif.announcement_id}/pdf`;
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
            .eq("id", notif.id)
            .eq("status", "PROCESSING");

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
          sentTodayByClient.set(clientId, sentToday + 1);
        } else {
          await supabase
            .from("notifications")
            .update({ status: "FAILED", error: result.error ?? "Unknown" })
            .eq("id", notif.id)
            .eq("status", "PROCESSING");

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
          .eq("id", notif.id)
          .eq("status", "PROCESSING");

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
