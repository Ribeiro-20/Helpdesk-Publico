/**
 * cron-contracts – ingestão diária de contratos
 *
 * Todos os dias às 23:00 (hora de Portugal) vai buscar os contratos
 * publicados nesse dia à API BASE e insere/atualiza a base de dados.
 *
 * Pipeline executado (tudo em Node.js, sem Edge Functions):
 *   1. ingest-contracts  → chama scripts/ingest-direct.js directamente
 *   2. extract-entities  → lógica inline com Supabase client
 *   3. extract-companies → lógica inline com Supabase client
 *   4. match-and-queue   → chama Edge Function (leve, não atinge limites)
 *
 * Uso:
 *   node cron-contracts.ts          → daemon (corre todos os dias às 23h)
 *   node cron-contracts.ts --once   → executa imediatamente e sai
 *
 * Variáveis de ambiente (.env na raiz do repo):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../../.env") });

// Lê supabase/functions/.env manualmente para garantir que sobrepõe
// (tem as credenciais JWT correctas para o PostgREST local)
function parseDotenvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const lines = readFileSync(filePath, "utf-8").split("\n");
  const result: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    result[key] = value;
  }
  return result;
}

const functionsEnv = parseDotenvFile(resolve(__dirname, "../functions/.env"));
for (const [key, value] of Object.entries(functionsEnv)) {
  process.env[key] = value;
}

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TENANT_ID_ENV = process.env.TENANT_ID ?? "c43fcb2c-2f0a-43c5-98ca-4a844ddc356d";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;
const SCRIPTS_DIR = resolve(__dirname, "../../scripts");

if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
  console.error("[cron-contracts] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidas.");
  process.exit(1);
}

function getSupabase() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BATCH_SIZE = 200;

function parseNifNome(raw: unknown): { nif: string; name: string } {
  if (typeof raw !== "string") {
    if (raw && typeof raw === "object") {
      const r = raw as Record<string, unknown>;
      const nif = typeof r.nif === "string" ? r.nif.trim() : "";
      const name = typeof r.name === "string" ? r.name.trim()
        : typeof r.value === "string" ? r.value.trim() : nif;
      return { nif, name };
    }
    return { nif: "", name: "" };
  }
  const s = raw.trim();
  const idx = s.indexOf(" - ");
  if (idx === -1) return { nif: s, name: s };
  return { nif: s.slice(0, idx).trim(), name: s.slice(idx + 3).trim() };
}

function mostFrequentLocation(locations: string[]): string | null {
  if (locations.length === 0) return null;
  const freq = new Map<string, number>();
  for (const loc of locations) {
    const parts = loc.split(",").map((s) => s.trim());
    const key = parts.length >= 3 ? `${parts[1]}, ${parts[2]}` : parts.length >= 2 ? parts[1] : loc;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  let best = ""; let bestCount = 0;
  for (const [key, count] of freq) { if (count > bestCount) { best = key; bestCount = count; } }
  return best || null;
}

function inferEntityType(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("câmara municipal") || n.includes("município") || n.includes("municipio")) return "município";
  if (n.includes("junta de freguesia") || n.includes("união de freguesias")) return "freguesia";
  if (n.includes("ministério") || n.includes("ministerio")) return "ministério";
  if (n.includes("hospital") || n.includes("centro hospitalar") || n.includes("unidade local de saúde")) return "saúde";
  if (n.includes("universidade") || n.includes("politécnico") || n.includes("escola superior") || n.includes("instituto superior")) return "ensino";
  if (n.includes("instituto") && !n.includes("instituto superior")) return "instituto";
  if (n.endsWith(", ep") || n.endsWith(", epe") || n.endsWith(", em") || n.endsWith(", sa") || n.includes(" - empresa municipal")) return "empresa_publica";
  if (n.includes("autoridade") || n.includes("regulador")) return "autoridade";
  return null;
}

function parseCompetitors(text: string | null): Array<{ nif: string; name: string }> {
  if (!text) return [];
  const chunks = text.split(/[;\n|]/).map((s) => s.trim()).filter(Boolean);
  return chunks
    .filter((c) => /^\d{5,}/.test(c))
    .map((c) => parseNifNome(c))
    .filter((c) => !!c.nif);
}

// ---------------------------------------------------------------------------
// Step 1 – ingest-contracts via ingest-direct.js
// ---------------------------------------------------------------------------

async function runIngestContracts(today: string, tenantId: string): Promise<void> {
  console.log(`[cron-contracts] → ingest-contracts (${today})...`);
  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      [
        "ingest-direct.js",
        "--from", today,
        "--to", today,
        "--tenant-id", tenantId,
      ],
      {
        cwd: SCRIPTS_DIR,
        timeout: 30 * 60 * 1000,
        maxBuffer: 1024 * 1024 * 20,
        env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY },
      },
    );
    const out = `${stdout ?? ""}\n${stderr ?? ""}`.trim();
    console.log(`[cron-contracts] ✓ ingest-contracts\n${out.slice(-1000)}`);
  } catch (err) {
    console.error("[cron-contracts] ✗ ingest-contracts:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Step 2 – extract-entities (Node.js directo)
// ---------------------------------------------------------------------------

async function runExtractEntities(tenantId: string): Promise<void> {
  console.log("[cron-contracts] → extract-entities...");
  const startedAt = Date.now();
  try {
    const supabase = getSupabase();
    const stats = { nifs_found: 0, entities_created: 0, entities_updated: 0, locations_set: 0, errors: 0, elapsed_ms: 0 };

    const entityInfo = new Map<string, { name: string }>();
    const entityAnnouncementCount = new Map<string, number>();

    let annOffset = 0;
    while (true) {
      const { data: batch } = await supabase.from("announcements")
        .select("entity_nif, entity_name").eq("tenant_id", tenantId).not("entity_nif", "is", null)
        .range(annOffset, annOffset + 999);
      if (!batch || batch.length === 0) break;
      for (const row of batch as Array<{ entity_nif: string | null; entity_name: string | null }>) {
        if (!row.entity_nif) continue;
        entityAnnouncementCount.set(row.entity_nif, (entityAnnouncementCount.get(row.entity_nif) ?? 0) + 1);
        if (!entityInfo.has(row.entity_nif)) entityInfo.set(row.entity_nif, { name: row.entity_name ?? row.entity_nif });
      }
      if (batch.length < 1000) break;
      annOffset += 1000;
    }

    const entityContracts = new Map<string, { count: number; totalValue: number; locations: string[]; cpvs: Map<string, number>; companies: Map<string, { name: string; count: number; value: number }>; lastDate: string | null }>();
    let offset = 0;
    while (true) {
      const { data: batch } = await supabase.from("contracts")
        .select("contracting_entities, execution_locations, contract_price, cpv_main, publication_date, winners")
        .eq("tenant_id", tenantId).range(offset, offset + 999);
      if (!batch || batch.length === 0) break;
      for (const c of batch as Array<{ contracting_entities: unknown; execution_locations: unknown; contract_price: number | null; cpv_main: string | null; publication_date: string | null; winners: unknown }>) {
        const entities = Array.isArray(c.contracting_entities) ? c.contracting_entities : [];
        const locations = Array.isArray(c.execution_locations) ? c.execution_locations as string[] : [];
        const winners = Array.isArray(c.winners) ? c.winners : [];
        for (const raw of entities) {
          const { nif, name } = parseNifNome(raw);
          if (!nif) continue;
          if (!entityInfo.has(nif)) entityInfo.set(nif, { name });
          let cd = entityContracts.get(nif);
          if (!cd) { cd = { count: 0, totalValue: 0, locations: [], cpvs: new Map(), companies: new Map(), lastDate: null }; entityContracts.set(nif, cd); }
          cd.count++; if (c.contract_price != null) cd.totalValue += c.contract_price;
          cd.locations.push(...locations);
          if (c.cpv_main) cd.cpvs.set(c.cpv_main, (cd.cpvs.get(c.cpv_main) ?? 0) + 1);
          for (const wr of winners) { const w = parseNifNome(wr); if (!w.nif) continue; const wd = cd.companies.get(w.nif) ?? { name: w.name, count: 0, value: 0 }; wd.count++; if (c.contract_price != null) wd.value += c.contract_price; cd.companies.set(w.nif, wd); }
          if (c.publication_date && (!cd.lastDate || c.publication_date > cd.lastDate)) cd.lastDate = c.publication_date;
        }
      }
      if (batch.length < 1000) break;
      offset += 1000;
    }

    stats.nifs_found = entityInfo.size;
    const existingEntities = new Map<string, { entity_type: string | null; location: string | null }>();
    const nifArr = [...entityInfo.keys()];
    for (let i = 0; i < nifArr.length; i += 500) {
      const { data } = await supabase.from("entities").select("nif, entity_type, location").eq("tenant_id", tenantId).in("nif", nifArr.slice(i, i + 500));
      for (const row of (data ?? []) as Array<{ nif: string; entity_type: string | null; location: string | null }>) existingEntities.set(row.nif, row);
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const [nif, info] of entityInfo) {
      const cd = entityContracts.get(nif);
      const existing = existingEntities.get(nif);
      const location = existing?.location ?? (cd ? mostFrequentLocation(cd.locations) : null);
      if (location && !existing?.location) stats.locations_set++;
      const totalContracts = cd?.count ?? 0; const totalValue = cd?.totalValue ?? 0;
      const topCpvs = cd ? [...cd.cpvs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([code, count]) => ({ code, count })) : [];
      const topCompanies = cd ? [...cd.companies.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([n, d]) => ({ nif: n, name: d.name, count: d.count, value: Math.round(d.value * 100) / 100 })) : [];
      rows.push({ tenant_id: tenantId, nif, name: info.name, entity_type: existing?.entity_type ?? inferEntityType(info.name), location, total_announcements: entityAnnouncementCount.get(nif) ?? 0, total_contracts: totalContracts, total_value: totalValue, avg_contract_value: totalContracts > 0 ? Math.round((totalValue / totalContracts) * 100) / 100 : null, top_cpvs: topCpvs, top_companies: topCompanies, last_activity_at: cd?.lastDate ? new Date(cd.lastDate).toISOString() : null });
      if (existing) stats.entities_updated++; else stats.entities_created++;
    }
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const { error } = await supabase.from("entities").upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: "tenant_id,nif" });
      if (error) stats.errors += Math.min(BATCH_SIZE, rows.length - i);
    }
    stats.elapsed_ms = Date.now() - startedAt;
    console.log(`[cron-contracts] ✓ extract-entities`, JSON.stringify(stats));
  } catch (err) {
    console.error("[cron-contracts] ✗ extract-entities:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Step 3 – extract-companies (Node.js directo)
// ---------------------------------------------------------------------------

async function runExtractCompanies(tenantId: string): Promise<void> {
  console.log("[cron-contracts] → extract-companies...");
  const startedAt = Date.now();
  try {
    const supabase = getSupabase();
    const stats = { contracts_scanned: 0, nifs_found: 0, companies_created: 0, companies_updated: 0, winners_extracted: 0, competitors_extracted: 0, locations_set: 0, errors: 0, elapsed_ms: 0 };

    interface CompanyData { name: string; contractsWon: number; contractsParticipated: number; totalValueWon: number; locations: string[]; cpvs: Map<string, { count: number; value: number }>; entities: Map<string, { name: string; count: number; value: number }>; lastWinDate: string | null; }
    const companyData = new Map<string, CompanyData>();
    function getOrCreate(nif: string, name: string): CompanyData {
      let d = companyData.get(nif);
      if (!d) { d = { name, contractsWon: 0, contractsParticipated: 0, totalValueWon: 0, locations: [], cpvs: new Map(), entities: new Map(), lastWinDate: null }; companyData.set(nif, d); }
      if (name && d.name === nif) d.name = name;
      return d;
    }

    let offset = 0;
    while (true) {
      const { data: batch } = await supabase.from("contracts")
        .select("winners, competitors, contracting_entities, execution_locations, contract_price, cpv_main, publication_date")
        .eq("tenant_id", tenantId).range(offset, offset + 999);
      if (!batch || batch.length === 0) break;
      stats.contracts_scanned += batch.length;
      for (const c of batch as Array<{ winners: unknown; competitors: string | null; contracting_entities: unknown; execution_locations: unknown; contract_price: number | null; cpv_main: string | null; publication_date: string | null }>) {
        const winners = Array.isArray(c.winners) ? c.winners : [];
        const locations = Array.isArray(c.execution_locations) ? c.execution_locations as string[] : [];
        const entities = Array.isArray(c.contracting_entities) ? c.contracting_entities : [];
        const entityParsed = entities.length > 0 ? parseNifNome(entities[0]) : null;
        for (const raw of winners) {
          const { nif, name } = parseNifNome(raw); if (!nif) continue;
          stats.winners_extracted++;
          const d = getOrCreate(nif, name);
          d.contractsWon++; d.contractsParticipated++; if (c.contract_price != null) d.totalValueWon += c.contract_price;
          d.locations.push(...locations);
          if (c.cpv_main) { const cd = d.cpvs.get(c.cpv_main) ?? { count: 0, value: 0 }; cd.count++; if (c.contract_price != null) cd.value += c.contract_price; d.cpvs.set(c.cpv_main, cd); }
          if (entityParsed?.nif) { const ed = d.entities.get(entityParsed.nif) ?? { name: entityParsed.name, count: 0, value: 0 }; ed.count++; if (c.contract_price != null) ed.value += c.contract_price; d.entities.set(entityParsed.nif, ed); }
          if (c.publication_date && (!d.lastWinDate || c.publication_date > d.lastWinDate)) d.lastWinDate = c.publication_date;
        }
        for (const { nif, name } of parseCompetitors(c.competitors)) { stats.competitors_extracted++; getOrCreate(nif, name).contractsParticipated++; }
      }
      if (batch.length < 1000) break;
      offset += 1000;
    }

    stats.nifs_found = companyData.size;
    const existingCompanies = new Map<string, { location: string | null }>();
    const nifArr = [...companyData.keys()];
    for (let i = 0; i < nifArr.length; i += 500) {
      const { data } = await supabase.from("companies").select("nif, location").eq("tenant_id", tenantId).in("nif", nifArr.slice(i, i + 500));
      for (const row of (data ?? []) as Array<{ nif: string; location: string | null }>) existingCompanies.set(row.nif, row);
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const [nif, d] of companyData) {
      const existing = existingCompanies.get(nif);
      const location = existing?.location ?? mostFrequentLocation(d.locations);
      if (location && !existing?.location) stats.locations_set++;
      const winRate = d.contractsParticipated > 0 ? Math.round((d.contractsWon / d.contractsParticipated) * 10000) / 100 : null;
      const avgValue = d.contractsWon > 0 ? Math.round((d.totalValueWon / d.contractsWon) * 100) / 100 : null;
      const cpvSpec = [...d.cpvs.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([code, cv]) => ({ code, count: cv.count, value: Math.round(cv.value * 100) / 100 }));
      const topEntities = [...d.entities.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([n, ev]) => ({ nif: n, name: ev.name, count: ev.count, value: Math.round(ev.value * 100) / 100 }));
      rows.push({ tenant_id: tenantId, nif, name: d.name, location, contracts_won: d.contractsWon, contracts_participated: d.contractsParticipated, total_value_won: Math.round(d.totalValueWon * 100) / 100, avg_contract_value: avgValue, win_rate: winRate, last_win_at: d.lastWinDate ? new Date(d.lastWinDate).toISOString() : null, cpv_specialization: cpvSpec, top_entities: topEntities });
      if (existing) stats.companies_updated++; else stats.companies_created++;
    }
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const { error } = await supabase.from("companies").upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: "tenant_id,nif" });
      if (error) stats.errors += Math.min(BATCH_SIZE, rows.length - i);
    }
    stats.elapsed_ms = Date.now() - startedAt;
    console.log(`[cron-contracts] ✓ extract-companies`, JSON.stringify(stats));
  } catch (err) {
    console.error("[cron-contracts] ✗ extract-companies:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Step 4 – match-and-queue via Edge Function (leve, funciona sem problemas)
// ---------------------------------------------------------------------------

async function runMatchAndQueue(): Promise<void> {
  console.log("[cron-contracts] → match-and-queue...");
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/match-and-queue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    if (!res.ok) { console.error(`[cron-contracts] ✗ match-and-queue HTTP ${res.status}:`, parsed); return; }
    console.log(`[cron-contracts] ✓ match-and-queue`, JSON.stringify(parsed));
  } catch (err) {
    console.error("[cron-contracts] ✗ match-and-queue:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Pipeline principal
// ---------------------------------------------------------------------------

async function runDailyContractPipeline(): Promise<void> {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
  console.log(`\n[cron-contracts] ${new Date().toISOString()} – a ingerir contratos de ${today}`);

  // Resolver tenant_id — usa variável de ambiente se disponível
  let tenantId = TENANT_ID_ENV;
  if (!tenantId) {
    const supabase = getSupabase();
    const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    tenantId = (tenant as { id: string } | null)?.id ?? "";
    if (!tenantId) {
      console.error("[cron-contracts] Não foi possível resolver tenant_id. Adiciona TENANT_ID ao .env");
      return;
    }
  }
  console.log(`[cron-contracts] tenant_id=${tenantId}`);

  await runIngestContracts(today, tenantId);
  await runExtractEntities(tenantId);
  await runExtractCompanies(tenantId);
  await runMatchAndQueue();

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
  cron.schedule(
    "0 23 * * *",
    () => { runDailyContractPipeline().catch(console.error); },
    { timezone: "Europe/Lisbon" },
  );
  console.log("[cron-contracts] Daemon iniciado.");
  console.log("  Pipeline diário às 23:00 (hora de Portugal)");
  console.log("[cron-contracts] Ctrl+C para parar.\n");
}
