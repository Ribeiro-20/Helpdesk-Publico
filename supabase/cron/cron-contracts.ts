/**
 * cron-contracts – ingestão diária de contratos
 *
 * Todos os dias às 23:00 (hora de Portugal) vai buscar os contratos
 * publicados nesse dia à API BASE e insere/atualiza a base de dados.
 *
 * Pipeline executado:
 *   1. ingest-contracts  → vai buscar contratos do dia à BASE API
 *   2. extract-entities  → extrai e atualiza entidades adjudicantes
 *   3. extract-companies → extrai e atualiza empresas vencedoras
 *   4. match-and-queue   → faz match com alertas e coloca notificações na fila
 *
 * Uso:
 *   node cron-contracts.ts          → daemon (corre todos os dias às 23h)
 *   node cron-contracts.ts --once   → executa imediatamente e sai
 *
 * Variáveis de ambiente necessárias (.env na raiz do repo):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../../.env") });

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

if (!SERVICE_ROLE_KEY) {
  console.error("[cron-contracts] SUPABASE_SERVICE_ROLE_KEY não definida.");
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
  console.log(`[cron-contracts] → ${name} ...`);
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
      console.error(`[cron-contracts] ✗ ${name} HTTP ${res.status}: ${text.slice(0, 300)}`);
      return;
    }

    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    console.log(`[cron-contracts] ✓ ${name}`, JSON.stringify(parsed));
  } catch (err) {
    console.error(`[cron-contracts] ✗ ${name} erro de rede:`, err);
  }
}

// ---------------------------------------------------------------------------
// Pipeline diário
// ---------------------------------------------------------------------------

async function runDailyContractPipeline(): Promise<void> {
  // Hora de Portugal pode ser UTC ou UTC+1 dependendo do DST.
  // Calculamos a data "de hoje" no fuso de Lisboa para garantir que
  // buscamos o dia correto independentemente do servidor.
  const today = new Date()
    .toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" }); // "YYYY-MM-DD"

  console.log(`\n[cron-contracts] ${new Date().toISOString()} – a ingerir contratos de ${today}`);

  await callFunction("ingest-contracts", { from_date: today, to_date: today });
  await callFunction("extract-entities");
  await callFunction("extract-companies");
  await callFunction("match-and-queue");

  console.log(`[cron-contracts] Pipeline concluído para ${today}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isOnce = process.argv.includes("--once");

if (isOnce) {
  console.log("[cron-contracts] Modo --once: a executar imediatamente...");
  try {
    await runDailyContractPipeline();
    console.log("[cron-contracts] Concluído.");
  } catch (err) {
    console.error("[cron-contracts] Erro fatal:", err);
    process.exit(1);
  }
  process.exit(0);
} else {
  // Todos os dias às 23:00 hora de Portugal (Europe/Lisbon trata DST automaticamente)
  cron.schedule(
    "0 23 * * *",
    () => { runDailyContractPipeline().catch(console.error); },
    { timezone: "Europe/Lisbon" },
  );

  console.log("[cron-contracts] Daemon iniciado.");
  console.log("  ingest-contracts + extract-entities + extract-companies + match-and-queue");
  console.log("  → todos os dias às 23:00 (hora de Portugal)");
  console.log("[cron-contracts] Ctrl+C para parar.\n");
}
