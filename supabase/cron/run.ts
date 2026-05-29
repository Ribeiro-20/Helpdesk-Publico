/**
 * BASE Monitor – local cron scheduler
 *
 * Calls Supabase Edge Functions on a schedule using the service role key.
 *
 * Usage:
 *   node run.ts --once      → run pipeline once and exit
 *   node run.ts             → daemon mode (uses node-cron)
 *
 * Requires .env (or environment variables):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Schedule:
 *   - ingest-base                                       : weekdays at 13:30 and 23:30
 */

import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";

// Load .env from common locations so the cron works both from the repo root
// and when launched directly inside supabase/cron.
const __dirname = dirname(fileURLToPath(import.meta.url));
const dotenvCandidates = [
  resolve(__dirname, "../../.env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), ".env"),
];

for (const candidate of dotenvCandidates) {
  const result = loadDotenv({ path: candidate, override: true });
  if (Object.keys(result.parsed ?? {}).length > 0) {
    console.log(`[cron] Loaded env from ${candidate}`);
    break;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

if (!SERVICE_ROLE_KEY) {
  console.error(
    "[cron] SUPABASE_SERVICE_ROLE_KEY is not set. Cannot call edge functions.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP caller
// ---------------------------------------------------------------------------

async function callFunction(
  name: string,
  body: Record<string, unknown> = {},
): Promise<{ ok: boolean; status: number; data: unknown }>
{
  const url = `${FUNCTIONS_BASE}/${name}`;
  console.log(`[cron] → ${name} ...`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      console.error(`[cron] ✗ ${name} HTTP ${res.status}: ${String(parsed).slice(0, 300)}`);
      return { ok: false, status: res.status, data: parsed };
    }

    console.log(`[cron] ✓ ${name}`, JSON.stringify(parsed));
    return { ok: true, status: res.status, data: parsed };
  } catch (err) {
    console.error(`[cron] ✗ ${name} network error:`, err);
    return { ok: false, status: 0, data: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Pipeline helpers
// ---------------------------------------------------------------------------

async function runIngestPipeline(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const body = { from_date: today, to_date: today };

  // 1) ingest-base
  const baseRes = await callFunction("ingest-base", body);
  const baseError = baseRes.ok ? null : (baseRes.data as Record<string, unknown>)?.error ?? `HTTP ${baseRes.status}`;
  const fetched = baseRes.ok && typeof (baseRes.data as Record<string, unknown>)?.fetched === "number"
    ? (baseRes.data as Record<string, unknown>).fetched as number
    : 0;

  // Helper to call internal Next API for ingest-dr
  const APP_BASE = process.env.APP_BASE_URL ?? "http://127.0.0.1:3001";
  async function callInternalIngestDr(requestBody: Record<string, unknown>) {
    const url = `${APP_BASE.replace(/\/$/, "")}/api/admin/ingest-dr`;
    console.log(`[cron] → ingest-dr (via ${url}) ...`);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json().catch(() => ({ raw: "invalid-json" }));
      if (!res.ok) {
        console.error(`[cron] ✗ ingest-dr HTTP ${res.status}:`, data);
        return { ok: false, status: res.status, data };
      }
      console.log(`[cron] ✓ ingest-dr`, JSON.stringify(data));
      return { ok: true, status: res.status, data };
    } catch (err) {
      console.error(`[cron] ✗ ingest-dr network error:`, err);
      return { ok: false, status: 0, data: String(err) };
    }
  }

  // 2) Decision logic mirroring AdminActions
  if (fetched <= 0) {
    // we scheduled daily single-day runs here, so canRunDrToday is true
    console.log("[cron] No new BASE announcements (fetched=0). Attempting DR and/or CPV processing.");
    // call ingest-dr for today
    const drRes = await callInternalIngestDr(body);
    // call match-and-queue regardless (to process enrichment/CPV)
    const mqRes = await callFunction("match-and-queue", body);
    const pipelineResult = { base: baseRes, ingest_dr: drRes, match_and_queue: mqRes };
    console.log("[cron] Pipeline result", pipelineResult);

    // Record history in ingestion_history table using service role
    try {
      const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

      // find tenant_id and a user_id (first app_user) to attribute this run
      const { data: tenantRow } = await supabaseAdmin.from("tenants").select("id").limit(1).maybeSingle();
      const tenantId = tenantRow?.id ?? null;

      let userId: string | null = null;
      if (tenantId) {
        const { data: appUser } = await supabaseAdmin.from("app_users").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle();
        userId = appUser?.id ?? null;
      }

      if (tenantId && userId) {
        const steps = [
          { fn: "ingest-base", label: "Anúncios BASE", category: "announcements", status: baseRes.ok ? "success" : "error", summary: baseRes.data ?? {}, payload: baseRes.data ?? {} },
          { fn: "ingest-dr", label: "Anúncios DR", category: "announcements", status: drRes.ok ? "success" : "error", summary: drRes.data ?? {}, payload: drRes.data ?? {} },
          { fn: "match-and-queue", label: "Correspondência CPV", category: "processing", status: mqRes.ok ? "success" : "error", summary: mqRes.data ?? {}, payload: mqRes.data ?? {} },
        ];

        const title = "Ingestão automática";
        const status = baseRes.ok && drRes.ok && mqRes.ok ? "success" : "error";

        const { error: insertError } = await supabaseAdmin.from("ingestion_history").insert({
          tenant_id: tenantId,
          user_id: userId,
          title,
          category: "announcements",
          status,
          range: body,
          steps,
          note: null,
        });

        if (insertError) console.error("[cron] ingestion_history insert failed:", insertError.message);
        else console.log("[cron] ingestion_history recorded");
      } else {
        console.warn("[cron] ingestion_history not recorded: no tenant/app_user found");
      }
    } catch (err) {
      console.error("[cron] error recording ingestion_history:", err);
    }

    return;
  }

  // fetched > 0: enrich with DR then run match-and-queue
  console.log("[cron] New BASE announcements fetched.");
  const drRes = await callInternalIngestDr(body);
  const mqRes = await callFunction("match-and-queue", body);
  const pipelineResult = { base: baseRes, ingest_dr: drRes, match_and_queue: mqRes };
  console.log("[cron] Pipeline result", pipelineResult);

  // Record history (same as above)
  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: tenantRow } = await supabaseAdmin.from("tenants").select("id").limit(1).maybeSingle();
    const tenantId = tenantRow?.id ?? null;
    let userId: string | null = null;
    if (tenantId) {
      const { data: appUser } = await supabaseAdmin.from("app_users").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle();
      userId = appUser?.id ?? null;
    }

    if (tenantId && userId) {
      const steps = [
        { fn: "ingest-base", label: "Anúncios BASE", category: "announcements", status: baseRes.ok ? "success" : "error", summary: baseRes.data ?? {}, payload: baseRes.data ?? {} },
        { fn: "ingest-dr", label: "Anúncios DR", category: "announcements", status: drRes.ok ? "success" : "error", summary: drRes.data ?? {}, payload: drRes.data ?? {} },
        { fn: "match-and-queue", label: "Correspondência CPV", category: "processing", status: mqRes.ok ? "success" : "error", summary: mqRes.data ?? {}, payload: mqRes.data ?? {} },
      ];

      const title = "Ingestão automática";
      const status = baseRes.ok && drRes.ok && mqRes.ok ? "success" : "error";

      const { error: insertError } = await supabaseAdmin.from("ingestion_history").insert({
        tenant_id: tenantId,
        user_id: userId,
        title,
        category: "announcements",
        status,
        range: body,
        steps,
        note: null,
      });

      if (insertError) console.error("[cron] ingestion_history insert failed:", insertError.message);
      else console.log("[cron] ingestion_history recorded");
    } else {
      console.warn("[cron] ingestion_history not recorded: no tenant/app_user found");
    }
  } catch (err) {
    console.error("[cron] error recording ingestion_history:", err);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isOnce = process.argv.includes("--once");

if (isOnce) {
  console.log("[cron] Running pipeline once …");
  try {
    await runIngestPipeline();
    console.log("[cron] Done.");
  } catch (err) {
    console.error("[cron] Fatal:", err);
    process.exit(1);
  }
  process.exit(0);
} else {
  console.log("[cron] Starting daemon …");

  // Weekdays at 13:30 and 23:30
  cron.schedule("30 13,23 * * 1-5", () => {
    console.log(`\n[cron] ${new Date().toISOString()} – ingest announcements`);
    runIngestPipeline().catch(console.error);
  });

  console.log("[cron] Scheduled:");
  console.log("  ingest-base                                       → weekdays at 13:30 and 23:30");
  console.log("[cron] Press Ctrl+C to stop.\n");
}
