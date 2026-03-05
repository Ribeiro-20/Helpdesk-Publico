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
 *   - ingest-base + match-and-queue : every 2 hours
 *   - send-emails                   : every 10 minutes
 */

import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";

// Load .env from repo root (two levels up from supabase/cron/)
const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../../.env") });

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
): Promise<void> {
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
    if (!res.ok) {
      console.error(`[cron] ✗ ${name} HTTP ${res.status}: ${text.slice(0, 300)}`);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    console.log(`[cron] ✓ ${name}`, JSON.stringify(parsed));
  } catch (err) {
    console.error(`[cron] ✗ ${name} network error:`, err);
  }
}

// ---------------------------------------------------------------------------
// Pipeline helpers
// ---------------------------------------------------------------------------

async function runIngestPipeline(): Promise<void> {
  await callFunction("ingest-base");
  await callFunction("match-and-queue");
}

async function runSendEmails(): Promise<void> {
  await callFunction("send-emails");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isOnce = process.argv.includes("--once");

if (isOnce) {
  console.log("[cron] Running pipeline once …");
  try {
    await runIngestPipeline();
    await runSendEmails();
    console.log("[cron] Done.");
  } catch (err) {
    console.error("[cron] Fatal:", err);
    process.exit(1);
  }
  process.exit(0);
} else {
  console.log("[cron] Starting daemon …");

  // Every 2 hours at minute 0
  cron.schedule("0 */2 * * *", () => {
    console.log(`\n[cron] ${new Date().toISOString()} – ingest pipeline`);
    runIngestPipeline().catch(console.error);
  });

  // Every 10 minutes
  cron.schedule("*/10 * * * *", () => {
    console.log(`\n[cron] ${new Date().toISOString()} – send-emails`);
    runSendEmails().catch(console.error);
  });

  console.log("[cron] Scheduled:");
  console.log("  ingest-base + match-and-queue → every 2 hours (at :00)");
  console.log("  send-emails                   → every 10 minutes");
  console.log("[cron] Press Ctrl+C to stop.\n");
}
