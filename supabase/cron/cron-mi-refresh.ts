/**
 * cron-mi-refresh – refresh diário da tabela mi_contracts
 *
 * Todos os dias às 02:00 (hora de Portugal) chama a Edge Function
 * mi-refresh-contracts que vai buscar contratos com 75-100% de progresso
 * e insere os novos em mi_contracts.
 *
 * Uso:
 *   node --import tsx cron-mi-refresh.ts          → daemon (corre todos os dias às 02:00)
 *   node --import tsx cron-mi-refresh.ts --once   → executa imediatamente e sai
 */

import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";

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
    console.log(`[cron-mi-refresh] Loaded env from ${candidate}`);
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:55321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

if (!SERVICE_ROLE_KEY) {
  console.error("[cron-mi-refresh] SUPABASE_SERVICE_ROLE_KEY não definida.");
  process.exit(1);
}

async function runRefresh(): Promise<void> {
  const ts = new Date().toISOString();
  console.log(`\n[cron-mi-refresh] ${ts} – a executar mi-refresh-contracts...`);

  try {
    const res = await fetch(`${FUNCTIONS_BASE}/mi-refresh-contracts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    if (!res.ok) {
      console.error(`[cron-mi-refresh] ✗ HTTP ${res.status}:`, parsed);
      return;
    }

    console.log(`[cron-mi-refresh] ✓ Concluído:`, JSON.stringify(parsed));
  } catch (err) {
    console.error(`[cron-mi-refresh] ✗ Erro de rede:`, err);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isOnce = process.argv.includes("--once");

if (isOnce) {
  console.log("[cron-mi-refresh] Modo --once: a executar imediatamente...");
  try {
    await runRefresh();
  } catch (err) {
    console.error("[cron-mi-refresh] Erro fatal:", err);
    process.exit(1);
  }
  process.exit(0);
} else {
  cron.schedule(
    "0 2 * * *",
    () => { runRefresh().catch(console.error); },
    { timezone: "Europe/Lisbon" },
  );
  console.log("[cron-mi-refresh] Daemon iniciado — mi-refresh-contracts às 02:00 (hora de Portugal)");
  console.log(`[cron-mi-refresh] target=${SUPABASE_URL}`);
  console.log("[cron-mi-refresh] Ctrl+C para parar.\n");
}
