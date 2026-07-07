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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync } from "node:fs";

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


  
  cron.schedule("30 13,23 * * 1-5", () => {
    console.log(`\n[cron] ${new Date().toISOString()} – ingest announcements`);
    runIngestPipeline().catch(console.error);
  });

  // MI Contract Alerts – weekdays at 08:00 (after nightly contract ingestion)
  cron.schedule("0 8 * * 1-5", () => {
    console.log(`\n[cron] ${new Date().toISOString()} – mi-contract-alerts`);
    callFunction("mi-contract-alerts").catch(console.error);
  }, { timezone: "Europe/Lisbon" });

  console.log("[cron] Scheduled:");
  console.log("  ingest-base                                       → weekdays at 13:30 and 23:30");
  console.log("  mi-contract-alerts                                → weekdays at 08:00 (Lisbon)");
  console.log("[cron] Press Ctrl+C to stop.\n");
}
