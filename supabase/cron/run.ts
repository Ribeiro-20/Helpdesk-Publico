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
 *   - send-emails                                       : daily at 08:30 (Europe/Lisbon)
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
  resolve(__dirname, "../functions/.env"),
  resolve(process.cwd(), "../functions/.env"),
];

const loadedEnvPaths = new Set<string>();
for (const candidate of dotenvCandidates) {
  if (loadedEnvPaths.has(candidate)) continue;
  const result = loadDotenv({ path: candidate, override: true });
  if (Object.keys(result.parsed ?? {}).length > 0) {
    loadedEnvPaths.add(candidate);
    console.log(`[cron] Loaded env from ${candidate}`);
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

type FunctionResult = { ok: boolean; status: number; data: unknown };

type TenantAlertConfig = {
  tenantId: string | null;
  tenantName: string | null;
  systemAlertEmail: string | null;
};

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

function extractNumericValue(data: unknown, field: string): number {
  if (!data || typeof data !== "object") return 0;
  const value = (data as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function extractDrInsertedCount(data: unknown): number {
  return extractDrSummaryCount(data, "inserted");
}

function extractDrUpdatedCount(data: unknown): number {
  return extractDrSummaryCount(data, "updated");
}

function extractDrSummaryCount(data: unknown, field: "inserted" | "updated" | "skipped"): number {
  if (!data || typeof data !== "object") return 0;
  const summary = typeof (data as Record<string, unknown>).summary === "string"
    ? (data as Record<string, unknown>).summary as string
    : "";
  const match = summary.match(new RegExp(`${field}=(\\d+)`));
  if (!match) return 0;
  const count = Number.parseInt(match[1], 10);
  return Number.isFinite(count) ? count : 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stepStatusLabel(value: unknown): string {
  const obj = asObject(value);
  if (!obj) return "n/d";
  if (obj.ok === true) return "OK";
  if (obj.ok === false) return "ERRO";
  if (extractErrorMessage(obj)) return "ERRO";
  if (typeof obj.errors === "number" && obj.errors > 0) return "ERRO";
  return "OK";
}

function extractErrorMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  const obj = asObject(value);
  if (!obj) return null;

  const directError = typeof obj.error === "string" ? obj.error.trim() : "";
  if (directError) return directError;

  const nestedDataError = asObject(obj.data)?.error;
  if (typeof nestedDataError === "string" && nestedDataError.trim()) {
    return nestedDataError.trim();
  }

  return null;
}

function buildSystemAlertReport(
  subject: string,
  payload: Record<string, unknown>,
  tenantLabel: string,
): string {
  const lines: string[] = [];
  const now = new Date();
  const generatedAt = new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Lisbon",
  }).format(now);

  lines.push("Relatório do alerta");
  lines.push(`Tenant: ${tenantLabel}`);
  lines.push(`Assunto: ${subject}`);
  lines.push(`Gerado em: ${generatedAt} (Europe/Lisbon)`);

  const range = asObject(payload.range);
  if (range?.from_date || range?.to_date) {
    lines.push(
      `Janela analisada: ${String(range.from_date ?? "?")} até ${String(range.to_date ?? "?")}`,
    );
  }

  const base = asObject(payload.base);
  const dr = asObject(payload.ingest_dr);
  const mq = asObject(payload.match_and_queue);
  if (base || dr || mq) {
    lines.push("Etapas:");
    lines.push(`- ingest-base: ${stepStatusLabel(base)}`);
    lines.push(`- ingest-dr: ${stepStatusLabel(dr)}`);
    lines.push(`- match-and-queue: ${stepStatusLabel(mq)}`);
  }

  const baseInserted = typeof payload.base_inserted === "number"
    ? payload.base_inserted
    : extractNumericValue(base, "inserted");
  const drInserted = typeof payload.dr_inserted === "number"
    ? payload.dr_inserted
    : extractDrInsertedCount(dr);
  const baseUpdated = typeof payload.base_updated === "number"
    ? payload.base_updated
    : extractNumericValue(base, "updated");
  const drUpdated = typeof payload.dr_updated === "number"
    ? payload.dr_updated
    : extractDrUpdatedCount(dr);

  if (Number.isFinite(baseInserted) || Number.isFinite(drInserted)) {
    const totalInserted = (Number.isFinite(baseInserted) ? baseInserted : 0) +
      (Number.isFinite(drInserted) ? drInserted : 0);
    const totalUpdated = (Number.isFinite(baseUpdated) ? baseUpdated : 0) +
      (Number.isFinite(drUpdated) ? drUpdated : 0);
    lines.push(
      `Novos registos: BASE=${Number.isFinite(baseInserted) ? baseInserted : 0}, DR=${Number.isFinite(drInserted) ? drInserted : 0}, Total=${totalInserted}`,
    );
    lines.push(
      `Registos atualizados: BASE=${Number.isFinite(baseUpdated) ? baseUpdated : 0}, DR=${Number.isFinite(drUpdated) ? drUpdated : 0}, Total=${totalUpdated}`,
    );
  }

  const summary = asObject(payload.summary);
  if (summary) {
    const processed = summary.processed;
    const sent = summary.sent;
    const failed = summary.failed;
    if (typeof processed === "number" || typeof sent === "number" || typeof failed === "number") {
      lines.push(
        `Resumo processamento: processados=${Number(processed ?? 0)}, enviados=${Number(sent ?? 0)}, falhas=${Number(failed ?? 0)}`,
      );
    }
  }

  const errorMessage =
    extractErrorMessage(payload.summary) ??
    extractErrorMessage(payload.base) ??
    extractErrorMessage(payload.ingest_dr) ??
    extractErrorMessage(payload.match_and_queue) ??
    extractErrorMessage(payload);
  if (errorMessage) {
    lines.push(`Erro principal: ${errorMessage}`);
  }

  return [
    ...lines,
    "",
    "Detalhe técnico (JSON):",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

async function loadTenantAlertConfig(): Promise<TenantAlertConfig> {
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("id, name, system_alert_email")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return {
    tenantId: data?.id ?? null,
    tenantName: data?.name ?? null,
    systemAlertEmail: data?.system_alert_email ?? null,
  };
}

async function sendSystemEmail(to: string, subject: string, text: string) {
  const provider = (process.env.EMAIL_PROVIDER ?? (process.env.BREVO_MI_API_KEY ? "brevo" : "dev")).trim().toLowerCase();
  const fromEmail = process.env.EMAIL_FROM ?? process.env.MAIL_FROM ?? "noreply@example.com";
  const fromName = process.env.EMAIL_FROM_NAME ?? "BASE Monitor";
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;"><div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;"><h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(subject)}</h1><pre style="white-space:pre-wrap;word-break:break-word;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;font-size:13px;line-height:1.55;">${escapeHtml(text)}</pre></div></body></html>`;

  if (provider === "brevo") {
    const apiKey = process.env.BREVO_MI_API_KEY;
    if (!apiKey) throw new Error("EMAIL_PROVIDER=brevo but BREVO_MI_API_KEY is not set");

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Brevo ${response.status}: ${await response.text()}`);
    }

    return;
  }

  if (provider === "mailpit") {
    const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";
    const response = await fetch(`${mailpitUrl}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: fromEmail, Name: fromName },
        To: [{ Email: to }],
        Subject: subject,
        HTML: html,
        Text: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Mailpit ${response.status}: ${await response.text()}`);
    }

    return;
  }

  if (provider === "sendgrid") {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) throw new Error("EMAIL_PROVIDER=sendgrid but SENDGRID_API_KEY is not set");

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [
          { type: "text/html", value: html },
          { type: "text/plain", value: text },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`SendGrid ${response.status}: ${await response.text()}`);
    }

    return;
  }

  console.log("─────────────────────────────────────────");
  console.log(`[SYSTEM ALERT] To      : ${to}`);
  console.log(`[SYSTEM ALERT] Subject : ${subject}`);
  console.log(`[SYSTEM ALERT] Body    :\n${text}`);
  console.log("─────────────────────────────────────────");
}

async function notifySystemAlert(subject: string, payload: Record<string, unknown>) {
  try {
    const config = await loadTenantAlertConfig();
    if (!config.systemAlertEmail) {
      return;
    }

    const tenantLabel = config.tenantName ?? config.tenantId ?? "—";

    const text = buildSystemAlertReport(subject, payload, tenantLabel);

    await sendSystemEmail(config.systemAlertEmail, subject, text);
    console.log(`[cron] system alert sent to ${config.systemAlertEmail}`);
  } catch (error) {
    console.error("[cron] failed to send system alert:", error);
  }
}

async function recordAutomaticIngestionHistory(
  body: Record<string, unknown>,
  baseRes: FunctionResult,
  drRes: FunctionResult,
  mqRes: FunctionResult,
) {
  try {
    const config = await loadTenantAlertConfig();
    const steps = [
      { fn: "ingest-base", label: "Anúncios BASE", category: "announcements", status: baseRes.ok ? "success" : "error", summary: baseRes.data ?? {}, payload: baseRes.data ?? {} },
      { fn: "ingest-dr", label: "Anúncios DR", category: "announcements", status: drRes.ok ? "success" : "error", summary: drRes.data ?? {}, payload: drRes.data ?? {} },
      { fn: "match-and-queue", label: "Correspondência CPV", category: "processing", status: mqRes.ok ? "success" : "error", summary: mqRes.data ?? {}, payload: mqRes.data ?? {} },
    ];

    const status = baseRes.ok && drRes.ok && mqRes.ok ? "success" : "error";
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error: insertError } = await supabaseAdmin.from("ingestion_history").insert({
      tenant_id: config.tenantId,
      user_id: null,
      title: "Ingestão automática",
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

async function maybeNotifyIngestionAlert(
  body: Record<string, unknown>,
  baseRes: FunctionResult,
  drRes: FunctionResult,
  mqRes: FunctionResult,
) {
  const status = baseRes.ok && drRes.ok && mqRes.ok ? "success" : "error";
  const baseInserted = extractNumericValue(baseRes.data, "inserted");
  const drInserted = extractDrInsertedCount(drRes.data);
  const baseUpdated = extractNumericValue(baseRes.data, "updated");
  const drUpdated = extractDrUpdatedCount(drRes.data);
  const totalInserted = baseInserted + drInserted;
  const totalUpdated = baseUpdated + drUpdated;

  if (status === "error") {
    await notifySystemAlert("Alerta do sistema: falha na ingestão automática", {
      range: body,
      base: baseRes.data,
      ingest_dr: drRes.data,
      match_and_queue: mqRes.data,
    });
    return;
  }

  if (totalInserted === 0 && totalUpdated === 0) {
    await notifySystemAlert("Alerta do sistema: ingestão automática sem novos registos", {
      range: body,
      base_inserted: baseInserted,
      dr_inserted: drInserted,
      base_updated: baseUpdated,
      dr_updated: drUpdated,
      base: baseRes.data,
      ingest_dr: drRes.data,
      match_and_queue: mqRes.data,
    });
  }
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
  const configuredWaitMs = Number.parseInt(process.env.DR_SCRAPE_WAIT_MS ?? "", 10);
  const waitMs = Number.isFinite(configuredWaitMs) && configuredWaitMs > 0
    ? configuredWaitMs
    : 30000;

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

function getCliArgValue(name: string): string | null {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim() || null;

  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1]?.trim() || null;

  return null;
}

async function runHubspotSyncJob(segmentIdOverride?: string | null): Promise<void> {
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

    const args = [tsxCli, "preview-hubspot-subscribers.ts", "--apply"];
    if (segmentIdOverride) {
      args.push("--segment-id", segmentIdOverride);
    }

    console.log(
      `[cron] -> hubspot-client-sync (${HUBSPOT_SYNC_SCHEDULE} Europe/Lisbon${segmentIdOverride ? `, segment ${segmentIdOverride}` : ""}) ...`,
    );
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      args,
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
    if (status === "error") {
      await notifySystemAlert("Alerta do sistema: falha na sincronização HubSpot", {
        started_at: startedAt,
        summary,
      });
    }
    hubspotSyncRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Pipeline helpers
// ---------------------------------------------------------------------------

async function runIngestPipeline(): Promise<void> {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - 2);

  const body = {
    from_date: fromDate.toISOString().slice(0, 10),
    to_date: toDate.toISOString().slice(0, 10),
  };

  // 1) ingest-base
  const baseRes = await callFunction("ingest-base", body);
  const baseError = baseRes.ok ? null : (baseRes.data as Record<string, unknown>)?.error ?? `HTTP ${baseRes.status}`;
  const fetched = baseRes.ok && typeof (baseRes.data as Record<string, unknown>)?.fetched === "number"
    ? (baseRes.data as Record<string, unknown>).fetched as number
    : 0;

  if (fetched <= 0) {
    // janela movel de 3 dias (hoje, ontem, anteontem)
    console.log("[cron] No new BASE announcements (fetched=0). Attempting DR and/or CPV processing.");
    // run DR scraper directly so we do not depend on browser auth or the Next middleware
    const drRes = await runDirectDrScrape(body);
    // call match-and-queue regardless (to process enrichment/CPV)
    const mqRes = await callFunction("match-and-queue", body);
    const pipelineResult = { base: baseRes, ingest_dr: drRes, match_and_queue: mqRes };
    console.log("[cron] Pipeline result", pipelineResult);

    await recordAutomaticIngestionHistory(body, baseRes, drRes, mqRes);
    await maybeNotifyIngestionAlert(body, baseRes, drRes, mqRes);

    return;
  }

  // enrequecimento DR
  console.log("[cron] New BASE announcements fetched.");
  const drRes = await runDirectDrScrape(body);
  const mqRes = await callFunction("match-and-queue", body);
  const pipelineResult = { base: baseRes, ingest_dr: drRes, match_and_queue: mqRes };
  console.log("[cron] Pipeline result", pipelineResult);

  await recordAutomaticIngestionHistory(body, baseRes, drRes, mqRes);
  await maybeNotifyIngestionAlert(body, baseRes, drRes, mqRes);
}

async function runSendEmailsJob(): Promise<void> {
  const startedAt = new Date().toISOString();
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
  let status: "success" | "error" = "success";
  let errorMessage: string | null = null;
  const batches: Array<Record<string, unknown>> = [];

  while (true) {
    const res = await callFunction("send-emails", { batch_size: batchSize });
    if (!res.ok) {
      console.error("[cron] send-emails job failed:", res.data);
      status = "error";
      errorMessage = typeof res.data === "string"
        ? res.data
        : JSON.stringify(res.data ?? { status: res.status });
      batches.push({
        ok: false,
        status: res.status,
        data: res.data,
      });
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
    batches.push({
      ok: true,
      processed,
      sent,
      failed,
      skipped,
      rate_limited: rateLimited,
      payload,
    });

    if (!Number.isFinite(processed) || processed < batchSize || processed === 0) {
      break;
    }
  }

  console.log(
    `[cron] send-emails job done: processed=${totalProcessed} sent=${totalSent} failed=${totalFailed} skipped=${totalSkipped} rate_limited=${totalRateLimited}`,
  );

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const alertConfig = await loadTenantAlertConfig();
    const tenantId = alertConfig.tenantId;

    const summary = {
      batch_size: batchSize,
      processed: totalProcessed,
      sent: totalSent,
      failed: totalFailed,
      skipped: totalSkipped,
      rate_limited: totalRateLimited,
      batches: batches.length,
      error: errorMessage,
    };

    const { error } = await supabaseAdmin.from("ingestion_history").insert({
      tenant_id: tenantId,
      user_id: null,
      title: "Envio automático de emails",
      category: "processing",
      status,
      range: { started_at: startedAt, finished_at: new Date().toISOString() },
      steps: [{
        fn: "send-emails",
        label: "Emails pendentes",
        category: "processing",
        status,
        summary,
        payload: { ...summary, batches },
      }],
      note: errorMessage,
    });

    if (error) throw error;
    console.log("[cron] send-emails history recorded");

    if (status === "error") {
      await notifySystemAlert("Alerta do sistema: falha no envio automático de emails", {
        started_at: startedAt,
        summary,
        batches,
      });
    }
  } catch (error) {
    console.error("[cron] send-emails history insert failed:", error);
  }
}

// ---------------------------------------------------------------------------
// MI HubSpot sync + contract alerts
// ---------------------------------------------------------------------------

let miSyncRunning = false;

async function runMiHubspotSyncJob(): Promise<void> {
  if (miSyncRunning) {
    console.warn("[cron] MI HubSpot sync skipped because a previous run is still active");
    return;
  }

  miSyncRunning = true;

  try {
    const scriptsDir = findScriptsDir();
    if (!scriptsDir) throw new Error("Could not locate the scripts directory for MI HubSpot sync");

    const tsxCli = findTsxCli(scriptsDir);
    if (!tsxCli) {
      throw new Error(
        `Could not locate tsx in ${scriptsDir}. Run 'npm install --prefix scripts' first.`,
      );
    }

    console.log(`[cron] → mi-hubspot-sync ...`);
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCli, "sync-mi-hubspot.ts", "--apply"],
      {
        cwd: scriptsDir,
        timeout: 10 * 60 * 1000,
        shell: false,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 5,
      },
    );

    const output = `${stdout ?? ""}\n${stderr ?? ""}`;
    console.log(`[cron] ✓ mi-hubspot-sync completed`);
    const tail = output.trim().slice(-2000);
    if (tail) console.log(`[cron] MI sync output:\n${tail}`);

    // After sync, trigger MI contract alerts
    console.log(`[cron] → mi-contract-alerts ...`);
    await callFunction("mi-contract-alerts");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron] MI HubSpot sync failed:", message);
  } finally {
    miSyncRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isOnce = process.argv.includes("--once");
const isHubspotOnce = process.argv.includes("--hubspot-once");
const hubspotSegmentIdOverride = getCliArgValue("--segment-id");

if (isHubspotOnce) {
  console.log("[cron] Running HubSpot client sync once ...");
  try {
    await runHubspotSyncJob(hubspotSegmentIdOverride);
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

    // MI HubSpot sync + contract alerts on same schedule
    cron.schedule(HUBSPOT_SYNC_SCHEDULE, () => {
      console.log(`\n[cron] ${new Date().toISOString()} - sync MI HubSpot + contract alerts`);
      runMiHubspotSyncJob().catch(console.error);
    }, { timezone: "Europe/Lisbon" });
  }

  cron.schedule("30 13,23 * * 1-5", () => {
    console.log(`\n[cron] ${new Date().toISOString()} – ingest announcements`);
    runIngestPipeline().catch(console.error);
  }, { timezone: "Europe/Lisbon" });

  cron.schedule("30 8 * * *", () => {
    console.log(`\n[cron] ${new Date().toISOString()} – send scheduled emails`);
    runSendEmailsJob().catch(console.error);
  }, { timezone: "Europe/Lisbon" });

  console.log("[cron] Scheduled:");
  console.log(
    HUBSPOT_SYNC_ENABLED
      ? `  hubspot-client-sync                                -> ${HUBSPOT_SYNC_SCHEDULE} Europe/Lisbon`
      : "  hubspot-client-sync                                -> disabled",
  );
  console.log(
    HUBSPOT_SYNC_ENABLED
      ? `  mi-hubspot-sync + mi-contract-alerts               -> ${HUBSPOT_SYNC_SCHEDULE} Europe/Lisbon`
      : "  mi-hubspot-sync + mi-contract-alerts               -> disabled",
  );
  console.log("  ingest-base                                       → weekdays at 13:30 and 23:30");
  console.log("  send-emails                                       → daily at 08:30 Europe/Lisbon");
  console.log("[cron] Press Ctrl+C to stop.\n");
}
