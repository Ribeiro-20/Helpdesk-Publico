import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildHistoricalWindows } from "../../apps/web/src/lib/historical-ingestion";

const here = dirname(fileURLToPath(import.meta.url));
for (const candidate of [resolve(here, "../../.env"), resolve(here, "../functions/.env")]) {
  if (existsSync(candidate)) loadDotenv({ path: candidate, override: true });
}
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada para o worker histórico.");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const workerId = randomUUID();
const execFileAsync = promisify(execFile);
const directContractsScript = resolve(here, "../../scripts/ingest-direct.js");
const LEASE_SECONDS = 120;
const sleep = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

type Job = {
  id: string;
  tenant_id: string;
  kind: "announcements" | "contracts";
  from_date: string;
  to_date: string;
  window_days: number;
  current_window: number;
  total_windows: number;
  fetched_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
};
type WindowStats = { fetched: number; inserted: number; updated: number; skipped: number; result: unknown };

function numberField(value: unknown, field: string): number {
  if (!value || typeof value !== "object") return 0;
  const candidate = Number((value as Record<string, unknown>)[field] ?? 0);
  return Number.isFinite(candidate) ? candidate : 0;
}

async function invokeAnnouncements(job: Job, from: string, to: string, signal: AbortSignal): Promise<WindowStats> {
  const functionName = "ingest-base";
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    signal,
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: job.tenant_id, from_date: from, to_date: to }),
  });
  const text = await response.text();
  let result: unknown;
  try { result = JSON.parse(text); } catch { result = { response: text.slice(0, 1000) }; }
  if (!response.ok) throw new Error(`${functionName} HTTP ${response.status}`);
  if (numberField(result, "errors") > 0) throw new Error(`${functionName} reported persistence errors`);
  return {
    fetched: numberField(result, "fetched"), inserted: numberField(result, "inserted"),
    updated: numberField(result, "updated"), skipped: numberField(result, "skipped"), result,
  };
}

async function invokeContracts(job: Job, from: string, to: string, signal: AbortSignal): Promise<WindowStats> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(job.tenant_id)) {
    throw new Error("Invalid tenant identifier in historical job.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("Invalid date range in historical job.");
  }
  const { stdout } = await execFileAsync(process.execPath, [
    directContractsScript, "--from", from, "--to", to,
    "--tenant-id", job.tenant_id, "--limit", "10000000",
  ], {
    cwd: resolve(here, "../.."),
    env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY },
    maxBuffer: 20 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
    signal,
  });
  const marker = stdout.match(/^\[ingest-direct-json\](\{.*\})$/m);
  if (!marker) throw new Error("Direct contract importer returned no machine-readable summary.");
  const result = JSON.parse(marker[1]) as unknown;
  if (numberField(result, "errors") > 0) throw new Error("Direct contract importer reported persistence errors.");
  return {
    fetched: numberField(result, "fetched"), inserted: 0,
    updated: 0, skipped: 0,
    result: { ...(result as Record<string, unknown>), write_counts_scope: "successful_attempt_only" },
  };
}

async function invokeIngestion(job: Job, from: string, to: string, signal: AbortSignal): Promise<WindowStats> {
  return job.kind === "contracts" ? invokeContracts(job, from, to, signal) : invokeAnnouncements(job, from, to, signal);
}

function buildJobWindows(job: Job): Array<{ from: string; to: string }> {
  if (job.kind === "announcements") return buildHistoricalWindows(job.from_date, job.to_date, job.window_days);
  const windows: Array<{ from: string; to: string }> = [];
  for (let year = Number(job.from_date.slice(0, 4)); year <= Number(job.to_date.slice(0, 4)); year += 1) {
    const from = job.from_date > `${year}-01-01` ? job.from_date : `${year}-01-01`;
    const to = job.to_date < `${year}-12-31` ? job.to_date : `${year}-12-31`;
    windows.push({ from, to });
  }
  return windows;
}

async function heartbeat(jobId: string): Promise<void> {
  const { data, error } = await supabase.from("historical_ingestion_jobs")
    .update({ lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(), updated_at: new Date().toISOString() })
    .eq("id", jobId).eq("worker_id", workerId).eq("status", "running").select("id").maybeSingle();
  if (error || !data) throw new Error("Lease histórico perdido.");
}

async function withHeartbeat<T>(jobId: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  await heartbeat(jobId);
  let heartbeatError: unknown = null;
  const controller = new AbortController();
  const timer = setInterval(() => {
    void heartbeat(jobId).catch((error) => {
      heartbeatError = error;
      controller.abort(error);
    });
  }, 30000);
  try {
    const result = await operation(controller.signal);
    if (heartbeatError) throw heartbeatError;
    return result;
  } catch (error) {
    if (heartbeatError) throw heartbeatError;
    throw error;
  } finally {
    clearInterval(timer);
  }
}

async function withRetries<T>(operation: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      console.error(`[historical-worker] ${label}, tentativa ${attempt}/3:`, error);
      if (error instanceof Error && error.message.includes("Lease histórico perdido")) throw error;
      if (attempt < 3) await sleep(attempt * 15000);
    }
  }
  throw lastError;
}

async function claimJob(): Promise<Job | null> {
  const { data, error } = await supabase.rpc("claim_historical_ingestion_job", {
    p_worker_id: workerId, p_lease_seconds: LEASE_SECONDS,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as Job | null;
}

async function leasedUpdate(jobId: string, values: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.from("historical_ingestion_jobs")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", jobId).eq("worker_id", workerId).eq("status", "running").select("id").maybeSingle();
  if (error || !data) throw new Error("Lease histórico perdido durante actualização.");
}

async function processJob(job: Job): Promise<void> {
  const windows = buildJobWindows(job);
  if (windows.length !== job.total_windows) throw new Error("Número de janelas históricas inconsistente.");
  let fetched = Number(job.fetched_count ?? 0), inserted = Number(job.inserted_count ?? 0);
  let updated = Number(job.updated_count ?? 0), skipped = Number(job.skipped_count ?? 0);
  try {
    for (let index = job.current_window; index < windows.length; index += 1) {
      const window = windows[index];
      const label = `${job.kind} ${window.from}..${window.to}`;
      console.log(`[historical-worker] ${job.id} janela ${index + 1}/${windows.length}: ${label}`);
      const stats = await withRetries(
        () => withHeartbeat(job.id, (signal) => invokeIngestion(job, window.from, window.to, signal)), label,
      );
      fetched += stats.fetched; inserted += stats.inserted; updated += stats.updated; skipped += stats.skipped;
      await leasedUpdate(job.id, {
        current_window: index + 1, fetched_count: fetched, inserted_count: inserted,
        updated_count: updated, skipped_count: skipped,
        last_result: { from: window.from, to: window.to, result: stats.result },
        last_error: null, public_error: null,
        lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(),
      });
    }
    await leasedUpdate(job.id, {
      status: "completed", worker_id: null, lease_expires_at: null, finished_at: new Date().toISOString(),
    });
    console.log(`[historical-worker] ${job.id} concluído.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const current = windows[Math.min(job.current_window, windows.length - 1)];
    await supabase.from("historical_ingestion_jobs").update({
      status: "failed", worker_id: null, lease_expires_at: null,
      last_error: message.slice(0, 4000),
      public_error: current ? `Falha ao processar o intervalo ${current.from} a ${current.to}.` : "Falha na ingestão histórica.",
      finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("worker_id", workerId).eq("status", "running");
    console.error(`[historical-worker] ${job.id} falhou:`, message);
  }
}

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
console.log(`[historical-worker] iniciado worker=${workerId}.`);
while (!stopping) {
  try { const job = await claimJob(); if (job) await processJob(job); else await sleep(10000); }
  catch (error) { console.error("[historical-worker] erro no ciclo:", error); await sleep(10000); }
}
console.log("[historical-worker] terminado.");
