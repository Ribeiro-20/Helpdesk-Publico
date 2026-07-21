/**
 * Edge Function: mi-contract-alerts
 *
 * Sends Market Intelligence contract alerts to active MI subscribers.
 *
 * NEW LOGIC (replaces 75%-100% progress threshold):
 *   - Contracts are selected from those INGESTED THE PREVIOUS DAY (created_at between
 *     yesterday 00:00 and today 00:00, Europe/Lisbon).
 *   - CPV matching is applied: each subscriber only receives contracts whose cpv_main
 *     starts with one of the subscriber's registered CPV codes.
 *   - The matched contracts are split into two equal batches:
 *       PENDING_MORNING → first half  → sent at the 08:00 run
 *       PENDING_EVENING → second half → sent at the 18:00 run
 *   - Deduplication: UNIQUE(subscriber_id, contract_id) prevents re-sending.
 *
 * Request body:
 *   { batch: "morning" | "evening" }
 *
 * Response:
 *   { batch, notifications_created, notifications_queued, emails_sent, emails_failed }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createMiEmailProvider, buildMiContractAlertEmail } from "../_shared/emailProvider.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const LISBON_TZ = "Europe/Lisbon";

/** Returns the UTC ISO boundaries for "yesterday" in the Europe/Lisbon timezone */
function getYesterdayLisbonRangeUtc(): { startIso: string; endIso: string } {
  const now = new Date();

  // Get today's date parts in Lisbon time
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LISBON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = formatter.format(now); // e.g. "2026-07-22"
  const [year, month, day] = todayStr.split("-").map(Number);

  // today 00:00 Lisbon → UTC
  const todayStart = lisbonMidnightToUtc(year, month, day);
  // yesterday 00:00 Lisbon → UTC
  const yesterdayStart = lisbonMidnightToUtc(year, month, day - 1);

  return { startIso: yesterdayStart.toISOString(), endIso: todayStart.toISOString() };
}

function lisbonMidnightToUtc(year: number, month: number, day: number): Date {
  // Build a reference UTC timestamp close to midnight Lisbon and iterate to find the exact offset
  let utcMs = Date.UTC(year, month - 1, day, 0, 0, 0);

  for (let i = 0; i < 4; i++) {
    const observed = new Intl.DateTimeFormat("en-CA", {
      timeZone: LISBON_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(utcMs));

    const get = (type: string) => Number(observed.find((p) => p.type === type)?.value ?? "0");
    const obsMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    const targetMs = Date.UTC(year, month - 1, day, 0, 0, 0);
    const diff = targetMs - obsMs;
    if (diff === 0) break;
    utcMs += diff;
  }

  return new Date(utcMs);
}

/** Helper to extract a clean display name from entity/winner raw data */
function cleanEntityName(raw: unknown): string {
  if (typeof raw === "string") {
    return raw.replace(/^[\s\-\/\.]+/g, "").trim() || "—";
  }
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const val = record.value ?? record.label ?? record.text ?? record.name;
    if (typeof val === "string") return val.replace(/^[\s\-\/\.]+/g, "").trim() || "—";
  }
  return "—";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const batch: "morning" | "evening" = body.batch === "evening" ? "evening" : "morning";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000";

    let notificationsCreated = 0;

    // ──────────────────────────────────────────────────────────────────────────
    // MORNING BATCH: match contracts ingested yesterday → queue PENDING_MORNING
    //                + PENDING_EVENING, then send PENDING_MORNING
    // ──────────────────────────────────────────────────────────────────────────
    if (batch === "morning") {

      // 1. Fetch active subscribers
      const { data: subscribers, error: subsErr } = await supabase
        .from("mi_subscribers")
        .select("id, email, name, cpv_filter, cpv_codes, min_progress")
        .eq("is_active", true);

      if (subsErr) throw subsErr;

      if (!subscribers || subscribers.length === 0) {
        console.log("[mi-contract-alerts] No active subscribers found.");
        return new Response(
          JSON.stringify({ batch, message: "No active subscribers found.", notifications_created: 0, emails_sent: 0, emails_failed: 0 }),
          { status: 200, headers: CORS },
        );
      }

      // 2. Fetch contracts ingested yesterday (Europe/Lisbon)
      const { startIso, endIso } = getYesterdayLisbonRangeUtc();
      console.log(`[mi-contract-alerts] Fetching contracts ingested between ${startIso} and ${endIso}`);

      const { data: ingestedContracts, error: contractsErr } = await supabase
        .from("contracts")
        .select("id, object, contracting_entities, winners, contract_price, signing_date, execution_deadline_days, cpv_main, status")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .eq("status", "active");

      if (contractsErr) throw contractsErr;

      const candidateContracts = ingestedContracts ?? [];
      console.log(`[mi-contract-alerts] Found ${candidateContracts.length} contracts ingested yesterday.`);

      if (candidateContracts.length === 0) {
        console.log("[mi-contract-alerts] No contracts ingested yesterday. Nothing to queue.");
        return new Response(
          JSON.stringify({ batch, message: "No contracts ingested yesterday.", notifications_created: 0, emails_sent: 0, emails_failed: 0 }),
          { status: 200, headers: CORS },
        );
      }

      // 3. For each subscriber: match CPVs and split into morning/evening halves
      for (const sub of subscribers) {
        const cpvCodes: string[] = Array.isArray(sub.cpv_codes) && sub.cpv_codes.length > 0
          ? sub.cpv_codes.map((c: string) => String(c).trim().toUpperCase())
          : sub.cpv_filter
          ? [sub.cpv_filter.trim().toUpperCase()]
          : [];

        // Filter contracts by CPV match
        const matched = candidateContracts.filter((c: any) => {
          if (cpvCodes.length === 0) return true; // No CPV filter → receive all
          const mainCpv = (c.cpv_main ?? "").trim().toUpperCase();
          return cpvCodes.some((cpv: string) => mainCpv.startsWith(cpv));
        });

        if (matched.length === 0) continue;

        // Split matched contracts: first half → PENDING_MORNING, second half → PENDING_EVENING
        const midpoint = Math.ceil(matched.length / 2);
        const morningContracts = matched.slice(0, midpoint);
        const eveningContracts = matched.slice(midpoint);

        const rows = [
          ...morningContracts.map((c: any) => ({
            subscriber_id: sub.id,
            contract_id: c.id,
            progress_at_send: 0, // New contracts: progress is 0 (just ingested)
            status: "PENDING_MORNING",
          })),
          ...eveningContracts.map((c: any) => ({
            subscriber_id: sub.id,
            contract_id: c.id,
            progress_at_send: 0,
            status: "PENDING_EVENING",
          })),
        ];

        if (rows.length > 0) {
          const { data: inserted, error: batchErr } = await supabase
            .from("mi_contract_notifications")
            .upsert(rows, { onConflict: "subscriber_id,contract_id", ignoreDuplicates: true })
            .select("id");

          if (!batchErr && inserted) {
            notificationsCreated += inserted.length;
          } else if (batchErr) {
            console.error(`[mi-contract-alerts] Upsert error for subscriber ${sub.id}:`, batchErr);
          }
        }
      }

      console.log(`[mi-contract-alerts] ${notificationsCreated} new notifications queued (morning batch).`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SEND STEP: fetch and send the appropriate batch status
    // ──────────────────────────────────────────────────────────────────────────
    const targetStatus = batch === "morning" ? "PENDING_MORNING" : "PENDING_EVENING";

    const { data: pendingNotifications, error: notifErr } = await supabase
      .from("mi_contract_notifications")
      .select(`
        id,
        subscriber_id,
        contract_id,
        progress_at_send,
        mi_subscribers (
          email,
          name
        ),
        contracts (
          id,
          object,
          contracting_entities,
          winners,
          contract_price,
          signing_date,
          execution_deadline_days,
          cpv_main
        )
      `)
      .eq("status", targetStatus)
      .order("created_at", { ascending: true });

    if (notifErr) throw notifErr;

    const notifications = pendingNotifications ?? [];
    console.log(`[mi-contract-alerts] Processing ${notifications.length} ${targetStatus} notifications.`);

    const emailProvider = createMiEmailProvider();
    let emailsSent = 0;
    let emailsFailed = 0;

    for (const notif of notifications) {
      const sub = notif.mi_subscribers as any;
      const contract = notif.contracts as any;
      if (!sub || !contract) {
        await supabase
          .from("mi_contract_notifications")
          .update({ status: "FAILED", error: "Missing subscriber or contract data" })
          .eq("id", notif.id);
        emailsFailed++;
        continue;
      }

      try {
        const entityRaw = Array.isArray(contract.contracting_entities)
          ? contract.contracting_entities[0]
          : contract.contracting_entities;
        const winnerRaw = Array.isArray(contract.winners)
          ? contract.winners[0]
          : contract.winners;

        const signingDate = contract.signing_date ? new Date(contract.signing_date) : new Date();
        const endDate = new Date(signingDate);
        endDate.setDate(endDate.getDate() + (contract.execution_deadline_days || 0));
        const estimatedEndDate = endDate.toISOString().slice(0, 10);

        const progress = notif.progress_at_send ?? 0;

        const contractForEmail = {
          contractId: contract.id,
          object: contract.object,
          entity: cleanEntityName(entityRaw),
          winner: cleanEntityName(winnerRaw),
          progress,
          contractPrice: contract.contract_price,
          signingDate: contract.signing_date,
          deadlineDays: contract.execution_deadline_days || 0,
          estimatedEndDate,
          cpvMain: contract.cpv_main || "—",
        };

        const shortObj = contract.object
          ? (contract.object.length > 50 ? contract.object.substring(0, 50) + "..." : contract.object)
          : "Contrato";
        const subject = `Alerta Market Intelligence: ${shortObj}`;

        const { html, text } = buildMiContractAlertEmail({
          subscriberName: sub.name || "Subscritor",
          contracts: [contractForEmail],
          appBaseUrl,
        });

        const result = await emailProvider.send({
          to: sub.email,
          subject,
          html,
          text,
          from: { email: "marketintelligence@helpdeskpublico.pt", name: "Helpdesk Público" },
        });

        if (result.success) {
          emailsSent++;
          await supabase
            .from("mi_contract_notifications")
            .update({ status: "SENT", sent_at: new Date().toISOString() })
            .eq("id", notif.id);
        } else {
          emailsFailed++;
          await supabase
            .from("mi_contract_notifications")
            .update({ status: "FAILED", error: result.error ?? "Provider error" })
            .eq("id", notif.id);
        }
      } catch (err) {
        emailsFailed++;
        console.error(`[mi-contract-alerts] Error sending notification ${notif.id}:`, err);
        await supabase
          .from("mi_contract_notifications")
          .update({ status: "FAILED", error: String(err) })
          .eq("id", notif.id);
      }
    }

    console.log(`[mi-contract-alerts] Done. batch=${batch} queued=${notificationsCreated} sent=${emailsSent} failed=${emailsFailed}`);

    return new Response(
      JSON.stringify({
        batch,
        notifications_created: notificationsCreated,
        notifications_queued: notifications.length,
        emails_sent: emailsSent,
        emails_failed: emailsFailed,
      }),
      { status: 200, headers: CORS },
    );
  } catch (err) {
    console.error("[mi-contract-alerts] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
