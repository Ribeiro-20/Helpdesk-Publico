/**
 * Edge Function: mi-contract-alerts
 *
 * Runs daily at 10:00 (Lisbon time).
 *
 * Logic:
 *   1. Fetches contracts from 'mi_contracts' that were INGESTED YESTERDAY by Project C
 *      (ingested_at between yesterday 00:00 and today 00:00 UTC).
 *   2. Fetches active MI subscribers from 'mi_subscribers'.
 *   3. Matches each subscriber's CPVs against the contracts' cpv_main.
 *   4. Sends e-mail alerts via Brevo for matched contracts.
 *   5. Logs sent alerts to 'mi_contract_notifications' to prevent duplicate sends.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createMiEmailProvider, buildMiContractAlertEmail } from "../_shared/emailProvider.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000";

    console.log("[mi-contract-alerts] Starting 10:00 AM Market Intelligence email alert job...");

    // 1. Fetch active subscribers
    const { data: subscribers, error: subsErr } = await supabase
      .from("mi_subscribers")
      .select("id, email, name, cpv_filter, cpv_codes")
      .eq("is_active", true);

    if (subsErr) throw subsErr;

    if (!subscribers || subscribers.length === 0) {
      console.log("[mi-contract-alerts] No active subscribers found.");
      return new Response(
        JSON.stringify({ ok: true, message: "No active subscribers found.", emails_sent: 0 }),
        { status: 200, headers: CORS }
      );
    }

    // 2. Fetch contracts from 'mi_contracts' that were ingested by Project C in the last 24 hours
    // (Project C ingests at 23:00; the 02:00 cron populates 'mi_contracts').
    // Strictly reads from 'mi_contracts' without querying raw 'contracts'.
    const twentyFourHoursAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    console.log(`[mi-contract-alerts] Searching mi_contracts ingested in the last 24 hours (since ${twentyFourHoursAgoIso})...`);

    const { data: recentMiContracts, error: miErr } = await supabase
      .from("mi_contracts")
      .select("*")
      .gte("ingested_at", twentyFourHoursAgoIso);

    if (miErr) throw miErr;

    const candidateContracts = recentMiContracts ?? [];
    console.log(`[mi-contract-alerts] Found ${candidateContracts.length} recent MI contracts ingested in the last 24h.`);

    if (candidateContracts.length === 0) {
      console.log("[mi-contract-alerts] No new contracts ingested yesterday. No emails to send.");
      return new Response(
        JSON.stringify({ ok: true, message: "No new contracts ingested yesterday.", emails_sent: 0 }),
        { status: 200, headers: CORS }
      );
    }

    const emailProvider = createMiEmailProvider();
    let emailsSent = 0;
    let emailsFailed = 0;

    // 3. For each subscriber, match CPVs and send alert if there are new matches
    for (const sub of subscribers) {
      const cpvCodes: string[] = Array.isArray(sub.cpv_codes) && sub.cpv_codes.length > 0
        ? sub.cpv_codes.map((c: string) => String(c).trim().toUpperCase())
        : sub.cpv_filter
        ? [sub.cpv_filter.trim().toUpperCase()]
        : [];

      const matchedContracts = candidateContracts.filter((c: any) => {
        if (cpvCodes.length === 0) return true;
        const mainCpv = (c.cpv_main ?? "").trim().toUpperCase();
        return cpvCodes.some((cpv: string) => mainCpv.startsWith(cpv));
      });

      if (matchedContracts.length === 0) continue;

      // Filter out contracts already sent to this subscriber
      const contractIds = matchedContracts.map((c: any) => c.contract_id);
      const { data: existingNotifs } = await supabase
        .from("mi_contract_notifications")
        .select("contract_id")
        .eq("subscriber_id", sub.id)
        .in("contract_id", contractIds);

      const alreadySentIds = new Set((existingNotifs ?? []).map((n: any) => n.contract_id));
      const contractsToSend = matchedContracts.filter((c: any) => !alreadySentIds.has(c.contract_id));

      if (contractsToSend.length === 0) continue;

      console.log(`[mi-contract-alerts] Sending email to ${sub.email} with ${contractsToSend.length} new contract alerts.`);

      try {
        const formattedContracts = contractsToSend.map((c: any) => {
          const entityRaw = Array.isArray(c.contracting_entities) ? c.contracting_entities[0] : c.contracting_entities;
          const winnerRaw = Array.isArray(c.winners) ? c.winners[0] : c.winners;
          const signingDate = c.signing_date ? new Date(c.signing_date) : new Date();
          const endDate = new Date(signingDate);
          endDate.setDate(endDate.getDate() + (c.execution_deadline_days || 0));

          return {
            contractId: c.contract_id,
            object: c.object,
            entity: cleanEntityName(entityRaw),
            winner: cleanEntityName(winnerRaw),
            progress: c.progress ?? 0.75,
            contractPrice: c.contract_price,
            signingDate: c.signing_date,
            deadlineDays: c.execution_deadline_days || 0,
            estimatedEndDate: endDate.toISOString().slice(0, 10),
            cpvMain: c.cpv_main || "—",
          };
        });

        const shortObj = formattedContracts[0].object
          ? (formattedContracts[0].object.length > 50 ? formattedContracts[0].object.substring(0, 50) + "..." : formattedContracts[0].object)
          : "Contratos";
        const subject = `Alerta Market Intelligence: ${formattedContracts.length} novos contratos (${shortObj})`;

        const { html, text } = buildMiContractAlertEmail({
          subscriberName: sub.name || "Subscritor",
          contracts: formattedContracts,
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
          // Record notifications in DB
          const notifRows = contractsToSend.map((c: any) => ({
            subscriber_id: sub.id,
            contract_id: c.contract_id,
            progress_at_send: c.progress,
            status: "SENT",
            sent_at: new Date().toISOString(),
          }));

          await supabase
            .from("mi_contract_notifications")
            .upsert(notifRows, { onConflict: "subscriber_id,contract_id" });
        } else {
          emailsFailed++;
          console.error(`[mi-contract-alerts] Failed to send email to ${sub.email}:`, result.error);
        }
      } catch (sendErr) {
        emailsFailed++;
        console.error(`[mi-contract-alerts] Exception sending email to ${sub.email}:`, sendErr);
      }
    }

    console.log(`[mi-contract-alerts] 10:00 AM Job finished. Sent: ${emailsSent}, Failed: ${emailsFailed}`);

    return new Response(
      JSON.stringify({
        ok: true,
        emails_sent: emailsSent,
        emails_failed: emailsFailed,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: CORS }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[mi-contract-alerts] Fatal error:", errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), { status: 500, headers: CORS });
  }
});
