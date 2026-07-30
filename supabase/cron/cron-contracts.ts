/**
 * cron-contracts – ingestão diária de contratos
 *
 * Todos os dias às 23:00 (hora de Portugal) vai buscar os contratos
 * publicados nesse dia à API BASE e insere na base de dados.
 *
 * Uso:
 *   node cron-contracts.ts          → daemon (corre todos os dias às 23h)
 *   node cron-contracts.ts --once   → executa imediatamente e sai
 *
 * Variáveis de ambiente (.env na raiz do repo ou supabase/functions/.env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   BASE_API_TOKEN
 */

import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import cron from "node-cron";

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

// Carrega variáveis de ambiente
loadDotenv({ path: resolve(__dirname, "../../.env") });

function parseDotenvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const result: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return result;
}

// supabase/functions/.env tem as credenciais JWT correctas para o PostgREST
const functionsEnv = parseDotenvFile(resolve(__dirname, "../functions/.env"));
for (const [k, v] of Object.entries(functionsEnv)) process.env[k] = v;

// ---------------------------------------------------------------------------
// Config — aponta para a base de dados de produção
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:55321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TENANT_ID = process.env.TENANT_ID ?? "c43fcb2c-2f0a-43c5-98ca-4a844ddc356d";
const SCRIPTS_DIR = resolve(__dirname, "../../scripts");

if (!SERVICE_ROLE_KEY) {
  console.error("[cron-contracts] SUPABASE_SERVICE_ROLE_KEY não definida.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function runDailyContractPipeline(): Promise<void> {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
  console.log(`\n[cron-contracts] ${new Date().toISOString()} – a ingerir contratos de ${today}`);
  console.log(`[cron-contracts] target=${SUPABASE_URL} tenant=${TENANT_ID}`);

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        "ingest-direct.js",
        "--from", today,
        "--to", today,
        "--tenant-id", TENANT_ID,
      ],
      {
        cwd: SCRIPTS_DIR,
        timeout: 30 * 60 * 1000,
        maxBuffer: 1024 * 1024 * 20,
        env: {
          ...process.env,
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
        },
      },
    );

    const out = `${stdout ?? ""}\n${stderr ?? ""}`.trim();
    console.log(`[cron-contracts] ✓ contratos ingeridos\n${out.slice(-2000)}`);
  } catch (err) {
    console.error("[cron-contracts] ✗ erro:", err instanceof Error ? err.message : err);
  }

  console.log(`[cron-contracts] Concluído para ${today}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isOnce = process.argv.includes("--once");

if (isOnce) {
  console.log("[cron-contracts] Modo --once: a executar imediatamente...");
  try {
    await runDailyContractPipeline();
  } catch (err) {
    console.error("[cron-contracts] Erro fatal:", err);
    process.exit(1);
  }
  process.exit(0);
} else {
  cron.schedule(
    "0 23 * * *",
    () => { runDailyContractPipeline().catch(console.error); },
    { timezone: "Europe/Lisbon" },
  );
  console.log("[cron-contracts] Daemon iniciado — contratos às 23:00 (hora de Portugal)");
  console.log(`[cron-contracts] target=${SUPABASE_URL}`);
  console.log("[cron-contracts] Ctrl+C para parar.\n");
}
