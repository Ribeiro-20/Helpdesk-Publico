import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildHistoricalWindows, historicalProgress } from "./historical-ingestion";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const execFileAsync = promisify(execFile);

test("AbortSignal terminates a long-running child process", async () => {
  const controller = new AbortController();
  const startedAt = Date.now();
  const child = execFileAsync(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(child, (error: NodeJS.ErrnoException) => error.code === "ABORT_ERR");
  assert.ok(Date.now() - startedAt < 2000);
});

test("direct contract importer fails before ingestion when persistence is unavailable", async () => {
  const script = path.join(root, "scripts/ingest-direct.js");
  await assert.rejects(
    execFileAsync(process.execPath, [script, "--from", "2024-01-01", "--to", "2024-01-01", "--tenant-id", "c43fcb2c-2f0a-43c5-98ca-4a844ddc356d"], {
      env: { ...process.env, BASE_API_TOKEN: "test", SUPABASE_SERVICE_ROLE_KEY: "test", SUPABASE_URL: "http://127.0.0.1:1" },
      timeout: 5000,
    }),
    (error: NodeJS.ErrnoException & { stdout?: string }) => error.code !== undefined && !error.stdout?.includes("[ingest-direct-json]"),
  );
});

test("historical windows cover the full range without overlap", () => {
  assert.deepEqual(buildHistoricalWindows("2024-01-01", "2024-02-05", 15), [
    { from: "2024-01-01", to: "2024-01-15" },
    { from: "2024-01-16", to: "2024-01-30" },
    { from: "2024-01-31", to: "2024-02-05" },
  ]);
});

test("historical progress is bounded and deterministic", () => {
  assert.equal(historicalProgress(0, 75), 0);
  assert.equal(historicalProgress(38, 75), 51);
  assert.equal(historicalProgress(75, 75), 100);
  assert.equal(historicalProgress(90, 75), 100);
});

test("historical API enqueues immediately and the UI polls progress", () => {
  const route = fs.readFileSync(
    path.join(root, "apps/web/src/app/api/admin/ingest-dr/historical-base/route.ts"),
    "utf8",
  );
  const button = fs.readFileSync(
    path.join(root, "apps/web/src/components/market/BaseHistoricalIngestButton.tsx"),
    "utf8",
  );
  assert.match(route, /historical_ingestion_jobs/);
  assert.match(route, /status:\s*202/);
  assert.doesNotMatch(route, /for\s*\([^)]*chunk/i);
  assert.match(button, /analysisType:\s*"announcements"\s*\|\s*"contracts"/);
  assert.match(button, /method:\s*"GET"/);
  assert.match(button, /setInterval/);
  assert.match(button, /fetched_count} contratos processados/);
});

test("historical worker supports both announcement and contract jobs", () => {
  const worker = fs.readFileSync(
    path.join(root, "supabase/cron/historical-ingestion-worker.ts"),
    "utf8",
  );
  assert.match(worker, /ingest-base/);
  assert.match(worker, /scripts\/ingest-direct\.js/);
  assert.match(worker, /"--tenant-id", job\.tenant_id/);
  assert.match(worker, /buildJobWindows/);
  assert.match(worker, /`\$\{year\}-01-01`/);
  assert.match(worker, /tenant_id:\s*job\.tenant_id/);
  assert.match(worker, /claim_historical_ingestion_job/);
  assert.match(worker, /worker_id/);
  assert.match(worker, /lease_expires_at/);
  assert.match(worker, /reported persistence errors/);
  assert.match(worker, /controller\.abort\(error\)/);
  assert.match(worker, /signal,/);
  assert.match(worker, /write_counts_scope: "successful_attempt_only"/);
  assert.match(worker, /historical_ingestion_jobs/);
  const ingestContracts = fs.readFileSync(
    path.join(root, "supabase/functions/ingest-contracts/index.ts"),
    "utf8",
  );
  assert.match(ingestContracts, /const minDate = "2024-01-01"/);
  assert.match(ingestContracts, /authorization !== `Bearer \$\{serviceRoleKey\}`/);
  assert.match(ingestContracts, /Tenant obrigatório/);
  assert.match(ingestContracts, /!dryRun && contractsToWrite\.length > 0/);
  assert.match(ingestContracts, /correlation_id: correlationId/);
  assert.doesNotMatch(ingestContracts, /JSON\.stringify\(\{ error: String\(err\) \}\)/);
  const directImporter = fs.readFileSync(path.join(root, "scripts/ingest-direct.js"), "utf8");
  assert.match(directImporter, /Missing required --tenant-id/);
  assert.match(directImporter, /\[ingest-direct-json\]/);
  assert.match(directImporter, /if \(errors > 0\) process\.exit\(1\)/);
  assert.doesNotMatch(directImporter, /tenants\?select=id&limit=1/);
  assert.doesNotMatch(directImporter, /errors\+\+|errors \+=/);
  assert.match(directImporter, /throw new Error\(`Contract insert HTTP/);
});

test("historical migration prevents simultaneous jobs per tenant and kind", () => {
  const sql = fs.readFileSync(
    path.join(root, "supabase/migrations/20260818150000_historical_ingestion_jobs.sql"),
    "utf8",
  );
  assert.match(sql, /create table[^;]*historical_ingestion_jobs/is);
  assert.match(sql, /create unique index[^;]*where\s+status\s+in\s*\(\s*'queued'\s*,\s*'running'\s*\)/is);
  assert.match(sql, /current_tenant_id\(\)/i);
  assert.match(sql, /revoke all on table public\.historical_ingestion_jobs from public, anon, authenticated/i);
  assert.match(sql, /enqueue_historical_ingestion/i);
  assert.match(sql, /resume_historical_ingestion/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /p_lease_seconds is null/i);
  assert.match(sql, /lease_expires_at is null or j\.lease_expires_at < now\(\)/i);
  assert.match(sql, /grant select \([\s\S]*public_error[\s\S]*\) on public\.historical_ingestion_jobs to authenticated/i);
  assert.match(sql, /return to_jsonb\(v_job\) - array\['requested_by','last_result','last_error','worker_id','lease_expires_at'\]/i);
  assert.match(sql, /if p_kind = 'contracts' then[\s\S]*extract\(year from p_to_date\)[\s\S]*extract\(year from p_from_date\)/i);
  assert.match(sql, /^begin;/i);
  assert.match(sql, /commit;\s*$/i);
});
