/**
 * Market Intelligence (MI) – Dedicated Cron Scheduler
 *
 * Runs only Market Intelligence scheduled jobs independently of other projects.
 *
 * Usage:
 *   node --import tsx run-mi.ts            → daemon mode (runs 02:00, 07:00, 10:00, 19:00)
 *   node --import tsx run-mi.ts --refresh  → run 02:00 refresh job once and exit
 *   node --import tsx run-mi.ts --sync     → run HubSpot subscriber sync once and exit
 *   node --import tsx run-mi.ts --email    → run 10:00 email alert job once and exit
 *   node --import tsx run-mi.ts --once     → run all MI jobs once and exit
 */

import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const dotenvCandidates = [
  resolve(__dirname, "../../.env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), ".env"),
  resolve(__dirname, "../functions/.env"),
  resolve(process.cwd(), "../functions/.env"),
];

for (const candidate of dotenvCandidates) {
  const result = loadDotenv({ path: candidate, override: true });
  if (Object.keys(result.parsed ?? {}).length > 0) {
    console.log(`[cron-mi] Loaded env from ${candidate}`);
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:55321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

if (!SERVICE_ROLE_KEY) {
  console.error("[cron-mi] SUPABASE_SERVICE_ROLE_KEY is not set. Cannot call edge functions.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------
async function callFunction(name: string, body: Record<string, unknown> = {}) {
  const url = `${FUNCTIONS_BASE}/${name}`;
  console.log(`[cron-mi] → ${name} ...`);
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
      console.error(`[cron-mi] ✗ ${name} HTTP ${res.status}:`, parsed);
      return { ok: false, status: res.status, data: parsed };
    }

    console.log(`[cron-mi] ✓ ${name}`, JSON.stringify(parsed));
    return { ok: true, status: res.status, data: parsed };
  } catch (err) {
    console.error(`[cron-mi] ✗ ${name} network error:`, err);
    return { ok: false, status: 0, data: String(err) };
  }
}

function findScriptsDir(): string | null {
  const candidates = [
    resolve(__dirname, "../../scripts"),
    resolve(process.cwd(), "../../scripts"),
    resolve(process.cwd(), "../scripts"),
    resolve(process.cwd(), "scripts"),
  ];
  return candidates.find((c) => existsSync(path.join(c, "sync-mi-hubspot.ts"))) ?? null;
}

function findTsxCli(scriptsDir: string): string | null {
  const candidates = [
    path.join(scriptsDir, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(scriptsDir, "node_modules", ".bin", "tsx"),
    path.join(scriptsDir, "node_modules", ".bin", "tsx.cmd"),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

// ---------------------------------------------------------------------------
// MI Job definitions
// ---------------------------------------------------------------------------

/**
 * 02:00 Refresh Job:
 * Calls refresh_mi_contracts() SQL function — faz tudo num único INSERT no servidor,
 * sem transferir dados para Node.js. Muito mais rápido do que paginar via RPC.
 */
async function runMiRefreshJob(): Promise<void> {
  console.log(`[cron-mi] Starting 02:00 MI refresh job...`);
  const { data, error } = await supabase.rpc("refresh_mi_contracts");
  if (error) throw error;
  console.log(`[cron-mi] ✓ Refresh done:`, JSON.stringify(data));
}

/**
 * 07:00 & 19:00 HubSpot Sync Job:
 * Syncs MI subscribers from HubSpot segment 2323 into mi_subscribers table.
 */
let isHubspotSyncRunning = false;
async function runMiHubspotSyncJob(): Promise<void> {
  if (isHubspotSyncRunning) {
    console.warn("[cron-mi] HubSpot sync skipped because a previous run is active");
    return;
  }
  isHubspotSyncRunning = true;
  try {
    const scriptsDir = findScriptsDir();
    if (!scriptsDir) throw new Error("Could not locate scripts directory for HubSpot sync");
    const tsxCli = findTsxCli(scriptsDir);
    if (!tsxCli) throw new Error(`Could not locate tsx in ${scriptsDir}`);

    console.log(`[cron-mi] → sync-mi-hubspot.ts ...`);
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCli, "sync-mi-hubspot.ts", "--apply"],
      { cwd: scriptsDir, timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 5 }
    );
    console.log(`[cron-mi] ✓ sync-mi-hubspot.ts completed`);
    const tail = `${stdout ?? ""}\n${stderr ?? ""}`.trim().slice(-1000);
    if (tail) console.log(`[cron-mi] Sync output:\n${tail}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron-mi] HubSpot sync failed:", message);
  } finally {
    isHubspotSyncRunning = false;
  }
}

/**
 * 10:00 Email Alert Job:
 * Calls mi-contract-alerts Edge Function to send email alerts for contracts ingested yesterday.
 */
async function runMiEmailJob(): Promise<void> {
  console.log(`[cron-mi] Starting 10:00 AM MI email alert job...`);
  await callFunction("mi-contract-alerts", {});
}

// ---------------------------------------------------------------------------
// Main CLI Execution
// ---------------------------------------------------------------------------

const isOnce = process.argv.includes("--once");
const isRefreshOnce = process.argv.includes("--refresh");
const isSyncOnce = process.argv.includes("--sync");
const isEmailOnce = process.argv.includes("--email");

if (isRefreshOnce) {
  console.log("[cron-mi] Executing 02:00 MI refresh job once...");
  await runMiRefreshJob();
} else if (isSyncOnce) {
  console.log("[cron-mi] Executing HubSpot subscriber sync once...");
  await runMiHubspotSyncJob();
} else if (isEmailOnce) {
  console.log("[cron-mi] Executing 10:00 AM MI email alert job once...");
  await runMiEmailJob();
} else if (isOnce) {
  console.log("[cron-mi] Executing all MI jobs once...");
  await runMiRefreshJob();
  await runMiHubspotSyncJob();
  await runMiEmailJob();
  console.log("[cron-mi] Done.");
} else {
  console.log("[cron-mi] Starting Market Intelligence dedicated daemon...");

  // 1. 02:00 Europe/Lisbon — Refresh mi_contracts (75-100%) & purge 100% > 30d
  cron.schedule("0 2 * * *", () => {
    console.log(`\n[cron-mi] ${new Date().toISOString()} – 02:00: Refresh mi_contracts`);
    runMiRefreshJob().catch(console.error);
  }, { timezone: "Europe/Lisbon" });

  // 2. 07:00 and 19:00 Europe/Lisbon — Sync MI subscribers from HubSpot
  cron.schedule("0 7,19 * * *", () => {
    console.log(`\n[cron-mi] ${new Date().toISOString()} – 07:00/19:00: Sync MI subscribers from HubSpot`);
    runMiHubspotSyncJob().catch(console.error);
  }, { timezone: "Europe/Lisbon" });

  // 3. 10:00 Europe/Lisbon — Send MI email alerts for yesterday's ingested contracts
  cron.schedule("0 10 * * *", () => {
    console.log(`\n[cron-mi] ${new Date().toISOString()} – 10:00: Send MI email alerts`);
    runMiEmailJob().catch(console.error);
  }, { timezone: "Europe/Lisbon" });

  console.log("[cron-mi] Scheduled:");
  console.log("  02:00 Europe/Lisbon -> Refresh mi_contracts (75-100%) & purge 100% > 30d");
  console.log("  07:00 & 19:00 Europe/Lisbon -> Sync MI subscribers from HubSpot segment 2323");
  console.log("  10:00 Europe/Lisbon -> Send MI email alerts (yesterday's ingested contracts)");
  console.log("[cron-mi] Daemon active. Press Ctrl+C to stop.\n");
}
