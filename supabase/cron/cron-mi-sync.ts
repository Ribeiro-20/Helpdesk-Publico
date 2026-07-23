/**
 * cron-mi-sync – sincronização de subscritores MI com HubSpot
 *
 * Todos os dias às 07:00 e às 19:00 (hora de Portugal) corre o script
 * sync-mi-hubspot.ts que sincroniza os subscritores do segmento HubSpot
 * para a tabela mi_subscribers.
 *
 * Uso:
 *   node --import tsx cron-mi-sync.ts          → daemon (corre às 07:00 e 19:00)
 *   node --import tsx cron-mi-sync.ts --once   → executa imediatamente e sai
 */

import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import cron from "node-cron";

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

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
    console.log(`[cron-mi-sync] Loaded env from ${candidate}`);
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

let isRunning = false;

async function runSync(): Promise<void> {
  if (isRunning) {
    console.warn("[cron-mi-sync] Sync já em curso, a ignorar esta execução.");
    return;
  }
  isRunning = true;

  const ts = new Date().toISOString();
  console.log(`\n[cron-mi-sync] ${ts} – a sincronizar subscritores MI com HubSpot...`);

  try {
    const scriptsDir = findScriptsDir();
    if (!scriptsDir) throw new Error("Pasta scripts não encontrada (sync-mi-hubspot.ts)");

    const tsxCli = findTsxCli(scriptsDir);
    if (!tsxCli) throw new Error(`tsx não encontrado em ${scriptsDir}`);

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCli, "sync-mi-hubspot.ts", "--apply"],
      { cwd: scriptsDir, timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 5 },
    );

    const out = `${stdout ?? ""}\n${stderr ?? ""}`.trim().slice(-1000);
    console.log(`[cron-mi-sync] ✓ Sync concluído`);
    if (out) console.log(`[cron-mi-sync] Output:\n${out}`);
  } catch (err) {
    console.error(`[cron-mi-sync] ✗ Erro:`, err instanceof Error ? err.message : err);
  } finally {
    isRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isOnce = process.argv.includes("--once");

if (isOnce) {
  console.log("[cron-mi-sync] Modo --once: a executar imediatamente...");
  try {
    await runSync();
  } catch (err) {
    console.error("[cron-mi-sync] Erro fatal:", err);
    process.exit(1);
  }
  process.exit(0);
} else {
  cron.schedule(
    "0 7,19 * * *",
    () => { runSync().catch(console.error); },
    { timezone: "Europe/Lisbon" },
  );
  console.log("[cron-mi-sync] Daemon iniciado — sync HubSpot às 07:00 e 19:00 (hora de Portugal)");
  console.log("[cron-mi-sync] Ctrl+C para parar.\n");
}
