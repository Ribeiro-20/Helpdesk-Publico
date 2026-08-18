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
  let year = new Date().getFullYear();
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

  if (!tenantIdArg) {
    console.error("Missing required --tenant-id.");
    process.exit(1);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000000) {
    console.error("Invalid --limit; expected an integer between 1 and 10000000.");
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
  }

  const yearsToFetch = fromDate && toDate
    ? listYearsInclusive(fromDate, toDate)
    : [year];

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
  console.log(
    `[ingest-direct] Fetching contracts for ${yearsToFetch.length === 1 ? `year ${yearsToFetch[0]}` : `years ${yearsToFetch[0]}..${yearsToFetch[yearsToFetch.length - 1]}`} (limit: ${limit})`
  );
  if (fromDate && toDate) {
    console.log(`[ingest-direct] Filtering by publication date in range ${fromDate}..${toDate}`);
  }

  let inserted = 0;
  let skipped = 0;
  let fetched = 0;
  let errors = 0;
  let processed = 0;

  // Tenant context is mandatory to prevent cross-tenant writes.
  const tenantId = tenantIdArg;
  console.log(`[ingest-direct] Using required tenant argument: ${tenantId}`);

  const BATCH_SIZE = 50;
  const rowsToInsert = [];
  const existingIds = new Set();
  let stopProcessing = false;

  try {
    let offset = 0;
    const pageSize = 1000;
    const rangeFilter = fromDate && toDate
      ? `or=(and(signing_date.gte.${fromDate},signing_date.lte.${toDate}),and(publication_date.gte.${fromDate},publication_date.lte.${toDate}))`
      : null;

    console.log(
      `[ingest-direct] Indexing existing contracts${rangeFilter ? ` in range ${fromDate}..${toDate}` : ""}...`,
    );

    while (true) {
      const query = rangeFilter
        ? `${restBaseUrl}/contracts?tenant_id=eq.${tenantId}&select=base_contract_id&limit=${pageSize}&offset=${offset}&${rangeFilter}`
        : `${restBaseUrl}/contracts?tenant_id=eq.${tenantId}&select=base_contract_id&limit=${pageSize}&offset=${offset}`;

      const res = await fetch(query, {
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": apiKey,
        },
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Could not fetch existing IDs: ${errText.slice(0, 200)}`);
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
    throw new Error(`[ingest-direct] Failed indexing existing contracts: ${err.message}`);
  }

  async function flushBatch() {
    if (rowsToInsert.length === 0) return;
    const uniqueMap = new Map();
    for (const row of rowsToInsert) {
      if (row.base_contract_id && !uniqueMap.has(row.base_contract_id)) uniqueMap.set(row.base_contract_id, row);
    }
    const uniqueRows = [...uniqueMap.values()];
    for (const row of uniqueRows) {
      const res = await fetch(`${restBaseUrl}/contracts`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": apiKey,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify([row]),
      });
      if (res.ok) {
        inserted += 1;
      } else if (res.status === 409) {
        skipped += 1;
      } else {
        const errText = await res.text();
        throw new Error(`Contract insert HTTP ${res.status}: ${errText.slice(0, 300)}`);
      }
    }
    rowsToInsert.length = 0;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const rangeDays = fromDate && toDate
    ? Math.floor((new Date(`${toDate}T00:00:00Z`).getTime() - new Date(`${fromDate}T00:00:00Z`).getTime()) / 86400000) + 1
    : null;
  const useRecentWindow = Boolean(
    fromDate &&
    toDate &&
    toDate === todayIso &&
    rangeDays !== null &&
    rangeDays > 0 &&
    rangeDays <= 90,
  );

  async function processPayload(payload, sourceLabel) {
    if (!Array.isArray(payload)) {
      throw new Error(`BASE API response for ${sourceLabel} is not a JSON array.`);
    }

    for (const raw of payload) {
      if (processed >= limit) {
        stopProcessing = true;
        break;
      }
      if (!raw || typeof raw !== "object") {
        skipped++;
        continue;
      }

      const contract = mapToContract(raw);

      if (fromDate && toDate && !useRecentWindow) {
        const effectiveDate = contract.publication_date || contract.signing_date;
        if (!effectiveDate || effectiveDate < fromDate || effectiveDate > toDate) {
          skipped++;
          continue;
        }
      }

      fetched++;

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
  }

  if (useRecentWindow) {
    const url = `https://www.base.gov.pt/APIBase2/GetInfoContrato?numDias=${rangeDays}`;
    console.log(`[ingest-direct] Fetching: ${url}`);

    const response = await fetch(url, {
      headers: { "_AcessToken": token },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch recent window: HTTP ${response.status}`);
    }
    const rawPayload = await response.json();
    await processPayload(extractContractsArray(rawPayload), `recent-window ${rangeDays}d`);
  } else {
    for (const currentYear of yearsToFetch) {
      if (stopProcessing) break;

      const url = `https://www.base.gov.pt/APIBase2/GetInfoContrato?Ano=${currentYear}`;
      console.log(`[ingest-direct] Fetching: ${url}`);

      const response = await fetch(url, {
        headers: { "_AcessToken": token },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch year ${currentYear}: HTTP ${response.status}`);
      }

      const rawPayload = await response.json();
      await processPayload(extractContractsArray(rawPayload), `year ${currentYear}`);
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
  console.log(`[ingest-direct-json]${JSON.stringify({ fetched, inserted, updated: 0, skipped, errors })}`);

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
  const envToken = process.env.BASE_API_TOKEN?.trim();
  if (envToken && envToken !== "<your BASE API token>") {
    return envToken;
  }

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

function listYearsInclusive(fromDate, toDate) {
  const years = [];
  const fromYear = Number(fromDate.slice(0, 4));
  const toYear = Number(toDate.slice(0, 4));
  for (let year = fromYear; year <= toYear; year++) {
    years.push(year);
  }
  return years;
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
