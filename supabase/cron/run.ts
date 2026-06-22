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
 *   - HubSpot client sync                               : daily at 07:00 and 21:00
 *   - ingest-base                                       : weekdays at 13:30 and 23:30
 *   - send-emails                                       : daily at 10:00 (Europe/Lisbon)
 */

import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

const execFileAsync = promisify(execFile);


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
const HUBSPOT_SYNC_ENABLED = (process.env.HUBSPOT_SYNC_ENABLED ?? "true")
  .trim()
  .toLowerCase() === "true";
const HUBSPOT_SYNC_SCHEDULE = process.env.HUBSPOT_SYNC_SCHEDULE?.trim() || "0 7,21 * * *";

if (!SERVICE_ROLE_KEY) {
  console.error(
    "[cron] SUPABASE_SERVICE_ROLE_KEY is not set. Cannot call edge functions.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP 
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

function findScriptsDir(): string | null {
  const scriptDirCandidates = [
    resolve(__dirname, "../../scripts"),
    resolve(process.cwd(), "../../scripts"),
    resolve(process.cwd(), "../scripts"),
    resolve(process.cwd(), "scripts"),
  ];

  return scriptDirCandidates.find((candidate) =>
    existsSync(path.join(candidate, "scrape-dr-contracts.ts")),
  ) ?? null;
}

function findTsxCli(scriptsDir: string): string | null {
  const candidates = [
    path.join(scriptsDir, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(scriptsDir, "node_modules", ".bin", "tsx"),
    path.join(scriptsDir, "node_modules", ".bin", "tsx.cmd"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function parseDrScrapeOutput(output: string) {
  const summaryLine = output
    .split(/\r?\n/)
    .find((line) => line.includes("[dr-scrape] inserted=")) ?? null;
  const normalizedLine = output
    .split(/\r?\n/)
    .find((line) => line.includes("[dr-scrape] normalized candidates:")) ?? null;

  const normalizedCandidates = normalizedLine
    ? Number.parseInt(normalizedLine.split(":").pop()?.trim() ?? "", 10)
    : null;

  return {
    summary: summaryLine,
    normalized_candidates: Number.isFinite(normalizedCandidates) ? normalizedCandidates : null,
    output: output.slice(-12000),
  };
}

async function runDirectDrScrape(requestBody: Record<string, unknown>) {
  const scriptsDir = findScriptsDir();

  if (!scriptsDir) {
    return {
      ok: false,
      status: 500,
      data: {
        error: "Não foi possível localizar a pasta scripts para correr o scraper DR.",
      },
    };
  }

  const tsxCli = findTsxCli(scriptsDir);

  if (!tsxCli) {
    return {
      ok: false,
      status: 500,
      data: {
        error:
          `Não foi possível localizar o executável tsx em ${scriptsDir}. ` +
          "Execute 'npm install --prefix scripts' e tente novamente.",
      },
    };
  }

  const fromDate = typeof requestBody.from_date === "string" ? requestBody.from_date : new Date().toISOString().slice(0, 10);
  const toDate = typeof requestBody.to_date === "string" ? requestBody.to_date : fromDate;
  const maxResults = typeof requestBody.max_results === "number" && Number.isFinite(requestBody.max_results)
    ? Math.floor(requestBody.max_results)
    : 500;
  const waitMs = 12000;

  console.log(`[cron] → ingest-dr (direct ${path.relative(process.cwd(), scriptsDir) || scriptsDir}) ...`);

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        tsxCli,
        "scrape-dr-contracts.ts",
        "--upsert",
        "--from-date",
        fromDate,
        "--to-date",
        toDate,
        "--wait-ms",
        String(waitMs),
        "--max-results",
        String(maxResults),
      ],
      {
        cwd: scriptsDir,
        timeout: 30 * 60 * 1000,
        shell: false,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 10,
      },
    );

    const output = `${stdout ?? ""}\n${stderr ?? ""}`;
    const parsed = parseDrScrapeOutput(output);

    console.log(`[cron] ✓ ingest-dr`, JSON.stringify(parsed));

    return {
      ok: true,
      status: 200,
      data: {
        ok: true,
        from_date: fromDate,
        to_date: toDate,
        ...parsed,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron] ✗ ingest-dr direct error:`, message);
    return {
      ok: false,
      status: 500,
      data: {
        error: message,
      },
    };
  }
}

let hubspotSyncRunning = false;

async function recordHubspotSyncHistory(
  status: "success" | "error",
  startedAt: string,
  summary: Record<string, unknown>,
): Promise<void> {
  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: tenantRow, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (tenantError) throw tenantError;

    const { error } = await supabaseAdmin.from("ingestion_history").insert({
      tenant_id: tenantRow?.id ?? null,
      user_id: null,
      title: "Sincronizacao HubSpot",
      category: "other",
      status,
      range: { started_at: startedAt, finished_at: new Date().toISOString() },
      steps: [{
        fn: "hubspot-client-sync",
        label: "Clientes HubSpot",
        category: "other",
        status,
        summary,
        payload: summary,
      }],
      note: status === "error" ? String(summary.error ?? "HubSpot sync failed") : null,
    });

    if (error) throw error;
    console.log("[cron] HubSpot sync history recorded");
  } catch (error) {
    console.error("[cron] HubSpot sync history insert failed:", error);
  }
}

async function runHubspotSyncJob(): Promise<void> {
  if (hubspotSyncRunning) {
    console.warn("[cron] HubSpot sync skipped because a previous run is still active");
    return;
  }

  hubspotSyncRunning = true;
  const startedAt = new Date().toISOString();
  let status: "success" | "error" = "error";
  let summary: Record<string, unknown> = {};

  try {
    const scriptsDir = findScriptsDir();
    if (!scriptsDir) throw new Error("Could not locate the scripts directory for HubSpot sync");

    const tsxCli = findTsxCli(scriptsDir);
    if (!tsxCli) {
      throw new Error(
        `Could not locate tsx in ${scriptsDir}. Run 'npm install --prefix scripts' first.`,
      );
    }

    console.log(`[cron] -> hubspot-client-sync (${HUBSPOT_SYNC_SCHEDULE} Europe/Lisbon) ...`);
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCli, "preview-hubspot-subscribers.ts", "--apply"],
      {
        cwd: scriptsDir,
        timeout: 15 * 60 * 1000,
        shell: false,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 10,
        env: {
          ...process.env,
          EMAIL_SEND_ENABLED: "false",
        },
      },
    );

    const output = `${stdout ?? ""}\n${stderr ?? ""}`;
    const reportPath = path.join(scriptsDir, "output", "hubspot-subscribers-preview.json");
    if (!existsSync(reportPath)) throw new Error("HubSpot sync report was not created");

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, unknown>;
    if (report.mode !== "apply") throw new Error("HubSpot sync did not run in apply mode");

    summary = (report.stats ?? {}) as Record<string, unknown>;
    status = "success";
    console.log("[cron] HubSpot sync completed", JSON.stringify(summary));

    const outputTail = output.trim().slice(-4000);
    if (outputTail) console.log(`[cron] HubSpot sync output:\n${outputTail}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary = { error: message };
    console.error("[cron] HubSpot sync failed:", message);
    throw error;
  } finally {
    await recordHubspotSyncHistory(status, startedAt, summary);
    hubspotSyncRunning = false;
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

  if (fetched <= 0) {
    // we scheduled daily single-day runs here, so canRunDrToday is true
    console.log("[cron] No new BASE announcements (fetched=0). Attempting DR and/or CPV processing.");
    // run DR scraper directly so we do not depend on browser auth or the Next middleware
    const drRes = await runDirectDrScrape(body);
    // call match-and-queue regardless (to process enrichment/CPV)
    const mqRes = await callFunction("match-and-queue", body);
    const pipelineResult = { base: baseRes, ingest_dr: drRes, match_and_queue: mqRes };
    console.log("[cron] Pipeline result", pipelineResult);

    try {
      const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

      const { data: tenantRow } = await supabaseAdmin.from("tenants").select("id").limit(1).maybeSingle();
      const tenantId = tenantRow?.id ?? null;

      const steps = [
        { fn: "ingest-base", label: "Anúncios BASE", category: "announcements", status: baseRes.ok ? "success" : "error", summary: baseRes.data ?? {}, payload: baseRes.data ?? {} },
        { fn: "ingest-dr", label: "Anúncios DR", category: "announcements", status: drRes.ok ? "success" : "error", summary: drRes.data ?? {}, payload: drRes.data ?? {} },
        { fn: "match-and-queue", label: "Correspondência CPV", category: "processing", status: mqRes.ok ? "success" : "error", summary: mqRes.data ?? {}, payload: mqRes.data ?? {} },
      ];

      const title = "Ingestão automática";
      const status = baseRes.ok && drRes.ok && mqRes.ok ? "success" : "error";

      const { error: insertError } = await supabaseAdmin.from("ingestion_history").insert({
        tenant_id: tenantId,
        user_id: null,
        title,
        category: "announcements",
        status,
        range: body,
        steps,
        note: null,
      });

      if (insertError) console.error("[cron] ingestion_history insert failed:", insertError.message);
      else console.log("[cron] ingestion_history recorded");
    } catch (err) {
      console.error("[cron] error recording ingestion_history:", err);
    }

    return;
  }

  // enrequecimento DR
  console.log("[cron] New BASE announcements fetched.");
  const drRes = await runDirectDrScrape(body);
  const mqRes = await callFunction("match-and-queue", body);
  const pipelineResult = { base: baseRes, ingest_dr: drRes, match_and_queue: mqRes };
  console.log("[cron] Pipeline result", pipelineResult);

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: tenantRow } = await supabaseAdmin.from("tenants").select("id").limit(1).maybeSingle();
    const tenantId = tenantRow?.id ?? null;

    const steps = [
      { fn: "ingest-base", label: "Anúncios BASE", category: "announcements", status: baseRes.ok ? "success" : "error", summary: baseRes.data ?? {}, payload: baseRes.data ?? {} },
      { fn: "ingest-dr", label: "Anúncios DR", category: "announcements", status: drRes.ok ? "success" : "error", summary: drRes.data ?? {}, payload: drRes.data ?? {} },
      { fn: "match-and-queue", label: "Correspondência CPV", category: "processing", status: mqRes.ok ? "success" : "error", summary: mqRes.data ?? {}, payload: mqRes.data ?? {} },
    ];

    const title = "Ingestão automática";
    const status = baseRes.ok && drRes.ok && mqRes.ok ? "success" : "error";

    const { error: insertError } = await supabaseAdmin.from("ingestion_history").insert({
      tenant_id: tenantId,
      user_id: null,
      title,
      category: "announcements",
      status,
      range: body,
      steps,
      note: null,
    });

    if (insertError) console.error("[cron] ingestion_history insert failed:", insertError.message);
    else console.log("[cron] ingestion_history recorded");
  } catch (err) {
    console.error("[cron] error recording ingestion_history:", err);
  }
}

async function runSendEmailsJob(): Promise<void> {
  const batchSizeRaw = Number(process.env.SEND_EMAILS_BATCH_SIZE ?? "50");
  const batchSize = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0
    ? Math.floor(batchSizeRaw)
    : 50;

  console.log(`[cron] Starting send-emails job with batch_size=${batchSize}`);

  let totalProcessed = 0;
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalRateLimited = 0;

  while (true) {
    const res = await callFunction("send-emails", { batch_size: batchSize });
    if (!res.ok) {
      console.error("[cron] send-emails job failed:", res.data);
      break;
    }

    const payload = (res.data ?? {}) as Record<string, unknown>;
    const processed = Number(payload.processed ?? 0);
    const sent = Number(payload.sent ?? 0);
    const failed = Number(payload.failed ?? 0);
    const skipped = Number(payload.skipped ?? 0);
    const rateLimited = Number(payload.rate_limited ?? 0);

    totalProcessed += Number.isFinite(processed) ? processed : 0;
    totalSent += Number.isFinite(sent) ? sent : 0;
    totalFailed += Number.isFinite(failed) ? failed : 0;
    totalSkipped += Number.isFinite(skipped) ? skipped : 0;
    totalRateLimited += Number.isFinite(rateLimited) ? rateLimited : 0;

    if (!Number.isFinite(processed) || processed < batchSize || processed === 0) {
      break;
    }
  }

  console.log(
    `[cron] send-emails job done: processed=${totalProcessed} sent=${totalSent} failed=${totalFailed} skipped=${totalSkipped} rate_limited=${totalRateLimited}`,
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isOnce = process.argv.includes("--once");
const isHubspotOnce = process.argv.includes("--hubspot-once");

if (isHubspotOnce) {
  console.log("[cron] Running HubSpot client sync once ...");
  try {
    await runHubspotSyncJob();
    console.log("[cron] HubSpot sync done.");
  } catch (err) {
    console.error("[cron] Fatal:", err);
    process.exitCode = 1;
  }
} else if (isOnce) {
  console.log("[cron] Running pipeline once …");
  try {
    await runIngestPipeline();
    console.log("[cron] Done.");
  } catch (err) {
    console.error("[cron] Fatal:", err);
    process.exitCode = 1;
  }
} else {
  console.log("[cron] Starting daemon …");


  
  if (HUBSPOT_SYNC_ENABLED) {
    if (!cron.validate(HUBSPOT_SYNC_SCHEDULE)) {
      throw new Error(`Invalid HUBSPOT_SYNC_SCHEDULE: ${HUBSPOT_SYNC_SCHEDULE}`);
    }

    cron.schedule(HUBSPOT_SYNC_SCHEDULE, () => {
      console.log(`\n[cron] ${new Date().toISOString()} - sync HubSpot clients`);
      runHubspotSyncJob().catch(console.error);
    }, { timezone: "Europe/Lisbon" });
  }

  cron.schedule("30 13,23 * * 1-5", () => {
    console.log(`\n[cron] ${new Date().toISOString()} – ingest announcements`);
    runIngestPipeline().catch(console.error);
  }, { timezone: "Europe/Lisbon" });

  cron.schedule("0 10 * * *", () => {
    console.log(`\n[cron] ${new Date().toISOString()} – send scheduled emails`);
    runSendEmailsJob().catch(console.error);
  }, { timezone: "Europe/Lisbon" });

  console.log("[cron] Scheduled:");
  console.log(
    HUBSPOT_SYNC_ENABLED
      ? `  hubspot-client-sync                                -> ${HUBSPOT_SYNC_SCHEDULE} Europe/Lisbon`
      : "  hubspot-client-sync                                -> disabled",
  );
  console.log("  ingest-base                                       → weekdays at 13:30 and 23:30");
  console.log("  send-emails                                       → daily at 10:00 Europe/Lisbon");
  console.log("[cron] Press Ctrl+C to stop.\n");
}
