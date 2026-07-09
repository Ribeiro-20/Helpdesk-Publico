import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEmailProvider, buildMiContractAlertEmail } from "../_shared/emailProvider.ts";

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
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Resolve tenant_id
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("id")
      .limit(1)
      .single();

    if (tenantErr || !tenant) {
      return new Response(
        JSON.stringify({ error: "No tenant found. Run bootstrap first." }),
        { status: 400, headers: CORS },
      );
    }
    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "http://localhost:3000";

    // 1. Fetch active subscritores
    const { data: subscribers, error: subsErr } = await supabase
      .from("mi_subscribers")
      .select("id, email, name, cpv_filter, cpv_codes, min_progress")
      .eq("is_active", true);

    if (subsErr) throw subsErr;
    if (!subscribers || subscribers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active subscribers found." }),
        { status: 200, headers: CORS },
      );
    }

    // 2. Query high-progress contracts from optimized Postgres RPC
    const { data: contracts, error: contractsErr } = await supabase.rpc(
      "get_high_progress_contracts",
      { min_pct: 0.75, max_pct: 1.00 }
    );

    if (contractsErr) throw contractsErr;

    const candidateContracts = contracts ?? [];
    if (candidateContracts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No contracts found in the 75% - 100% progress range." }),
        { status: 200, headers: CORS },
      );
    }

    // 3. Match contracts to subscribers and queue PENDING notifications
    let notificationsCreated = 0;

    for (const sub of subscribers) {
      // Build list of CPV codes to match against
      const cpvCodes: string[] = Array.isArray(sub.cpv_codes) && sub.cpv_codes.length > 0
        ? sub.cpv_codes.map((c: string) => String(c).trim().toUpperCase())
        : sub.cpv_filter
          ? [sub.cpv_filter.trim().toUpperCase()]
          : [];

      const matchedContracts = candidateContracts.filter((c: any) => {
        // Apply CPV filter: contract must match at least one of the subscriber's CPVs
        if (cpvCodes.length > 0) {
          const mainCpv = (c.cpv_main ?? "").trim().toUpperCase();
          const hasMatch = cpvCodes.some((cpv: string) => mainCpv.startsWith(cpv));
          if (!hasMatch) return false;
        }
        // Apply subscriber's specific min_progress threshold
        if (c.progress < (sub.min_progress ?? 0.75)) {
          return false;
        }
        return true;
      });

      // Send all matching contracts (do not limit to 1)
      const limitedContracts = matchedContracts
        .sort((a: any, b: any) => (b.progress ?? 0) - (a.progress ?? 0));

      // Batch insert PENDING notifications
      const rows = limitedContracts.map((contract: any) => ({
        subscriber_id: sub.id,
        contract_id: contract.id,
        progress_at_send: contract.progress,
        status: "PENDING",
      }));

      if (rows.length > 0) {
        const { data: inserted, error: batchErr } = await supabase
          .from("mi_contract_notifications")
          .upsert(rows, { onConflict: "subscriber_id,contract_id", ignoreDuplicates: true })
          .select("id");

        if (!batchErr && inserted) {
          notificationsCreated += inserted.length;
        }
      }
    }

    // 4. Process PENDING notifications and send emails
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
          object,
          contracting_entities,
          winners,
          contract_price,
          signing_date,
          execution_deadline_days,
          cpv_main
        )
      `)
      .eq("status", "PENDING");

    if (notifErr) throw notifErr;

    const emailProvider = createEmailProvider();
    let emailsSent = 0;
    let emailsFailed = 0;

    // Helper to format entity/winner names
    function cleanEntityName(raw: unknown): string {
      if (typeof raw === "string") {
        return raw.replace(/^[\s\-\/\.]+/g, "").trim();
      }
      if (raw && typeof raw === "object") {
        const record = raw as Record<string, unknown>;
        const val = record.value ?? record.label ?? record.text ?? record.name;
        if (typeof val === "string") return val.replace(/^[\s\-\/\.]+/g, "").trim();
      }
      return "—";
    }

    for (const notif of pendingNotifications ?? []) {
      const sub = notif.mi_subscribers as any;
      const contract = notif.contracts as any;
      if (!sub || !contract) continue;

      try {
        const entityRaw = Array.isArray(contract.contracting_entities) ? contract.contracting_entities[0] : contract.contracting_entities;
        const winnerRaw = Array.isArray(contract.winners) ? contract.winners[0] : contract.winners;

        const signingDate = new Date(contract.signing_date);
        const endDate = new Date(signingDate);
        endDate.setDate(endDate.getDate() + (contract.execution_deadline_days || 0));
        const estimatedEndDate = endDate.toISOString().slice(0, 10);

        const contractForEmail = {
          contractId: contract.id,
          object: contract.object,
          entity: cleanEntityName(entityRaw),
          winner: cleanEntityName(winnerRaw),
          progress: notif.progress_at_send,
          contractPrice: contract.contract_price,
          signingDate: contract.signing_date,
          deadlineDays: contract.execution_deadline_days || 0,
          estimatedEndDate,
          cpvMain: contract.cpv_main || "—",
        };

        // Create a unique subject for each contract email
        const shortObj = contract.object ? (contract.object.length > 50 ? contract.object.substring(0, 50) + "..." : contract.object) : "Contrato";
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
        await supabase
          .from("mi_contract_notifications")
          .update({ status: "FAILED", error: String(err) })
          .eq("id", notif.id);
      }
    }

    return new Response(
      JSON.stringify({
        notifications_created: notificationsCreated,
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
