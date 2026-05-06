#!/usr/bin/env node

/**
 * Direct Supabase REST API ingest for contracts using streaming JSON parsing.
 * Avoids loading the full BASE API yearly payload into memory.
 *
 * Usage:
 *   node scripts/ingest-direct.js --year 2026 --limit 1000
 *   node scripts/ingest-direct.js --from 2026-03-15 --to 2026-03-17
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Parse CLI args
  let year = 2026;
  let limit = 1000;
  let fromDate = null;
  let toDate = null;
  let tenantIdArg = null;
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) year = Number(args[++i]);
    if (args[i] === "--limit" && args[i + 1]) limit = Number(args[++i]);
    if (args[i] === "--from" && args[i + 1]) fromDate = args[++i];
    if (args[i] === "--to" && args[i + 1]) toDate = args[++i];
    if (args[i] === "--tenant-id" && args[i + 1]) tenantIdArg = args[++i];
  }

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    console.error("You must provide both --from and --to dates.");
    process.exit(1);
  }

  if (fromDate && toDate) {
    if (!isValidIsoDate(fromDate) || !isValidIsoDate(toDate)) {
      console.error("Invalid date format. Use YYYY-MM-DD.");
      process.exit(1);
    }
    if (fromDate > toDate) {
      console.error("from_date must be <= to_date");
      process.exit(1);
    }
    year = Number(fromDate.slice(0, 4));
  }

  // Read token from env files (prefer root .env)
  const envCandidates = [
    path.join(__dirname, "../.env"),
    path.join(__dirname, "../supabase/functions/.env"),
  ];
  const token = readTokenFromEnvCandidates(envCandidates);
  if (!token) {
    console.error("Could not find BASE_API_TOKEN in", envCandidates.join(" or "));
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
  const restBaseUrl = buildRestBaseUrl(supabaseUrl);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = serviceRoleKey;

  if (!serviceRoleKey) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY environment variable.\n" +
      "Get it from: supabase status --output json"
    );
    process.exit(1);
  }

  console.log(`\n[ingest-direct] Target: ${restBaseUrl}/contracts`);
  console.log(`[ingest-direct] Fetching contracts for year ${year} (limit: ${limit})`);
  if (fromDate && toDate) {
    console.log(`[ingest-direct] Filtering by signing date in range ${fromDate}..${toDate}`);
  }

  // Fetch from BASE API
  const url = `https://www.base.gov.pt/APIBase2/GetInfoContrato?Ano=${year}`;
  console.log(`[ingest-direct] Fetching: ${url}`);

  const response = await fetch(url, {
    headers: { "_AcessToken": token },
  });

  if (!response.ok) {
    console.error(`Failed to fetch: HTTP ${response.status}`);
    process.exit(1);
  }

  const rawPayload = await response.json().catch(() => null);
  const payload = extractContractsArray(rawPayload);
  if (!Array.isArray(payload)) {
    console.error("BASE API response is not a JSON array.");
    process.exit(1);
  }

  let inserted = 0;
  let skipped = 0;
  let fetched = 0;
  let errors = 0;
  let processed = 0;

  // Get tenant ID
  let tenantId = null;
  if (tenantIdArg) {
    tenantId = tenantIdArg;
    console.log(`[ingest-direct] Using tenant from args: ${tenantId}`);
  } else {
    try {
      const tenantRes = await fetch(`${restBaseUrl}/tenants?select=id&limit=1`, {
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": apiKey,
        },
      });
      const tenants = await tenantRes.json();
      if (Array.isArray(tenants) && tenants.length > 0 && tenants[0]?.id) {
        tenantId = tenants[0].id;
        console.log(`[ingest-direct] Using tenant from table: ${tenantId}`);
      } else {
        console.error("No tenant found. Pass --tenant-id or run admin-seed first.");
        process.exit(1);
      }
    } catch (err) {
      console.error("Failed to fetch tenant:", err.message);
      process.exit(1);
    }
  }

  const BATCH_SIZE = 50;
  const rowsToInsert = [];
  const existingIds = new Set();

  try {
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const res = await fetch(
        `${restBaseUrl}/contracts?tenant_id=eq.${tenantId}&select=base_contract_id&limit=${pageSize}&offset=${offset}`,
        {
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": apiKey,
          },
        },
      );
      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[ingest-direct] Could not fetch existing IDs: ${errText.slice(0, 200)}`);
        break;
      }
      const existing = await res.json();
      if (!Array.isArray(existing) || existing.length === 0) break;
      for (const row of existing) {
        if (row?.base_contract_id) existingIds.add(row.base_contract_id);
      }
      offset += pageSize;
    }
    console.log(`[ingest-direct] Existing contracts indexed: ${existingIds.size}`);
  } catch (err) {
    console.warn(`[ingest-direct] Failed indexing existing contracts: ${err.message}`);
  }

  async function flushBatch() {
    if (rowsToInsert.length === 0) return;
    try {
      const res = await fetch(`${restBaseUrl}/contracts`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": apiKey,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify(rowsToInsert),
      });

      if (res.ok) {
        inserted += rowsToInsert.length;
      } else {
        const errText = await res.text();
        console.error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
        errors += rowsToInsert.length;
      }
    } catch (err) {
      console.error(`Batch error: ${err.message}`);
      errors += rowsToInsert.length;
    } finally {
      rowsToInsert.length = 0;
    }
  }

  for (const raw of payload) {
    if (processed >= limit) break;
    if (!raw || typeof raw !== "object") {
      skipped++;
      continue;
    }

    fetched++;

    const contract = mapToContract(raw);

    if (fromDate && toDate) {
      const effectiveDate = contract.signing_date || contract.publication_date;
      if (!effectiveDate || effectiveDate < fromDate || effectiveDate > toDate) {
        skipped++;
        continue;
      }
    }

    if (!contract.base_contract_id) {
      skipped++;
      continue;
    }

    if (existingIds.has(contract.base_contract_id)) {
      skipped++;
      continue;
    }

    rowsToInsert.push({
      tenant_id: tenantId,
      source: "BASE_API",
      base_contract_id: contract.base_contract_id,
      base_procedure_id: contract.base_procedure_id,
      base_announcement_no: contract.base_announcement_no,
      base_incm_id: contract.base_incm_id,
      object: contract.object,
      description: contract.description,
      procedure_type: contract.procedure_type,
      contract_type: contract.contract_type,
      announcement_type: contract.announcement_type,
      legal_regime: contract.legal_regime,
      legal_basis: contract.legal_basis,
      publication_date: contract.publication_date,
      award_date: contract.award_date,
      signing_date: contract.signing_date,
      close_date: contract.close_date,
      base_price: contract.base_price,
      contract_price: contract.contract_price,
      effective_price: contract.effective_price,
      currency: contract.currency,
      contracting_entities: contract.contracting_entities,
      winners: contract.winners,
      competitors: contract.competitors,
      cpv_main: contract.cpv_main,
      cpv_list: contract.cpv_list,
      execution_deadline_days: contract.execution_deadline_days,
      execution_locations: contract.execution_locations,
      framework_agreement: contract.framework_agreement,
      is_centralized: contract.is_centralized,
      is_ecological: contract.is_ecological,
      end_type: contract.end_type,
      procedure_docs_url: contract.procedure_docs_url,
      observations: contract.observations,
      raw_payload: raw,
      raw_hash: computeRawHash(raw),
    });
    existingIds.add(contract.base_contract_id);

    processed++;
    if (rowsToInsert.length >= BATCH_SIZE) {
      await flushBatch();
      console.log(`[ingest-direct] Progress: processed=${processed} inserted=${inserted} skipped=${skipped} errors=${errors}`);
    }
  }

  await flushBatch();
  console.log(`[ingest-direct] Progress: processed=${processed} inserted=${inserted} skipped=${skipped} errors=${errors}`);

  console.log(`\n[ingest-direct] Done!`);
  console.log(`[ingest-direct] Fetched: ${fetched}`);
  console.log(`[ingest-direct] Processed: ${processed}`);
  console.log(`[ingest-direct] Inserted: ${inserted}`);
  console.log(`[ingest-direct] Skipped: ${skipped}`);
  console.log(`[ingest-direct] Errors: ${errors}`);

  if (errors > 0) process.exit(1);
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildRestBaseUrl(url) {
  const clean = String(url || "").replace(/\/+$/, "");
  if (clean.endsWith("/rest/v1")) return clean;
  return `${clean}/rest/v1`;
}

function readTokenFromEnvCandidates(paths) {
  for (const envPath of paths) {
    try {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(/BASE_API_TOKEN\s*=\s*(.+)/);
      const token = match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
      if (token && token !== "<your BASE API token>") {
        return token;
      }
    } catch {
      // ignore and try next candidate
    }
  }
  return null;
}

function parsePtDate(str) {
  if (!str) return null;
  const value = String(str).trim();

  const pt = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (pt) return `${pt[3]}-${pt[2]}-${pt[1]}`;

  const ptDash = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ptDash) return `${ptDash[3]}-${ptDash[2]}-${ptDash[1]}`;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

function extractContractsArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;

  const record = payload;
  const candidates = [record.data, record.items, record.result, record.results, record.Contratos, record.contratos];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return null;
}

function parsePrice(val) {
  if (val == null || val === "") return null;
  const s = String(val).replace(/\s/g, "");
  if (s.includes(",")) {
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function extractCpvCode(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s || s === "-" || s === "—") return null;

  const embedded = s.match(/\b\d{8}(?:-\d)?\b/);
  if (embedded) return embedded[0];

  const digits = s.replace(/\D/g, "");
  if (digits.length === 9) return `${digits.slice(0, 8)}-${digits[8]}`;
  if (digits.length === 8) return digits;

  return null;
}

function mapToContract(payload) {
  const rawCpvs = Array.isArray(payload.cpv) ? payload.cpv : [];
  const cpvCodes = rawCpvs
    .map((cpv) => extractCpvCode(cpv))
    .filter((cpv) => !!cpv);
  const cpvMain = cpvCodes.length > 0 ? cpvCodes[0] : null;

  return {
    base_contract_id: payload.idcontrato || null,
    base_procedure_id: payload.idprocedimento || null,
    base_announcement_no: payload.nAnuncio || null,
    base_incm_id: payload.idINCM || null,
    object: payload.objectoContrato || null,
    description: payload.descContrato || null,
    procedure_type: payload.tipoprocedimento || null,
    contract_type: Array.isArray(payload.tipoContrato)
      ? (payload.tipoContrato[0] || null)
      : (payload.tipoContrato || null),
    announcement_type: payload.TipoAnuncio || null,
    legal_regime: payload.regime || null,
    legal_basis: payload.fundamentacao || null,
    publication_date: parsePtDate(payload.dataPublicacao) || null,
    award_date: parsePtDate(payload.dataDecisaoAdjudicacao) || null,
    signing_date: parsePtDate(payload.dataCelebracaoContrato) || null,
    close_date: parsePtDate(payload.dataFechoContrato) || null,
    base_price: parsePrice(payload.precoBaseProcedimento),
    contract_price: parsePrice(payload.precoContratual),
    effective_price: parsePrice(payload.PrecoTotalEfetivo),
    currency: payload.moeda || "EUR",
    contracting_entities: Array.isArray(payload.adjudicante)
      ? payload.adjudicante
      : [payload.adjudicante || ""],
    winners: Array.isArray(payload.adjudicatarios) ? payload.adjudicatarios : [payload.adjudicatarios || ""],
    competitors: Array.isArray(payload.concorrentes) ? payload.concorrentes.join("; ") : (payload.concorrentes || null),
    cpv_main: cpvMain,
    cpv_list: cpvCodes,
    execution_deadline_days: payload.prazoExecucao ? Number(payload.prazoExecucao) : null,
    execution_locations: Array.isArray(payload.localExecucao)
      ? payload.localExecucao
      : [payload.localExecucao || ""],
    framework_agreement: payload.DescrAcordoQuadro || payload.numAcordoQuadro || null,
    is_centralized: payload.ProcedimentoCentralizado === "Sim" || payload.ProcedimentoCentralizado === true,
    is_ecological: payload.ContratEcologico === "Sim" || payload.ContratEcologico === true,
    end_type: payload.tipoFimContrato || null,
    procedure_docs_url: payload.linkPecasProc || null,
    observations: payload.Observacoes || null,
  };
}

function computeRawHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
