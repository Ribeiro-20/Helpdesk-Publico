/**
 * Edge Function: ingest-contracts
 *
 * Ingere contratos celebrados a partir do endpoint GetInfoContrato da API BASE.
 * Fluxo: fetch anual -> filtrar em streaming -> processar em chunks -> resolve links -> insert/update.
 *
 * Mantem deteccao de alteracoes sem hashear o raw_payload inteiro:
 * o campo raw_hash guarda um fingerprint barato com os campos mapeados.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { forEachContractsChunk, mapToContract, parseNifNome } from "../_shared/baseApi.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const BATCH_SIZE = 25;
const PROCESSING_CHUNK_SIZE = 5;
const MAX_RANGE_DAYS = 15;

type MappedContract = ReturnType<typeof mapToContract>;
type ChunkItem = { contract: MappedContract; fingerprint: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function diffDaysInclusive(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.floor((to - from) / 86400000) + 1;
}

function validateDateRange(fromDate: string, toDate: string): string | null {
  const minDate = "2026-01-01";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return "Datas invalidas. Use o formato YYYY-MM-DD.";
  }
  if (fromDate < minDate || toDate < minDate) {
    return `A ingestao manual de contratos so permite datas a partir de ${minDate}.`;
  }
  if (fromDate > toDate) {
    return "Intervalo invalido. A data inicial tem de ser anterior ou igual a data final.";
  }
  const days = diffDaysInclusive(fromDate, toDate);
  if (days > MAX_RANGE_DAYS) {
    return `Intervalo demasiado grande para contratos (${days} dias). Use blocos de ate ${MAX_RANGE_DAYS} dias.`;
  }
  return null;
}

function fingerprintPart(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join("||");
  return String(value);
}

function sha256Hex(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  return crypto.subtle.digest("SHA-256", data).then((buffer) =>
    Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

async function computeContractFingerprint(contract: MappedContract): Promise<string> {
  const fingerprint = [
    contract.base_contract_id,
    contract.base_procedure_id,
    contract.base_announcement_no,
    contract.base_incm_id,
    contract.object,
    contract.description,
    contract.procedure_type,
    contract.contract_type,
    contract.announcement_type,
    contract.legal_regime,
    contract.legal_basis,
    contract.publication_date,
    contract.award_date,
    contract.signing_date,
    contract.close_date,
    contract.base_price,
    contract.contract_price,
    contract.effective_price,
    contract.currency,
    contract.contracting_entities,
    contract.winners,
    contract.competitors,
    contract.cpv_main,
    contract.cpv_list,
    contract.execution_deadline_days,
    contract.execution_locations,
    contract.framework_agreement,
    contract.is_centralized,
    contract.is_ecological,
    contract.end_type,
    contract.procedure_docs_url,
    contract.observations,
  ].map(fingerprintPart).join("::");

  return sha256Hex(fingerprint);
}

function resolveLinks(
  contract: MappedContract,
  announcementMap: Map<string, string>,
  entityMap: Map<string, string>,
  companyMap: Map<string, string>,
) {
  let announcementId: string | null = null;
  let entityId: string | null = null;
  let winnerCompanyId: string | null = null;

  if (contract.base_announcement_no) {
    announcementId = announcementMap.get(contract.base_announcement_no) ?? null;
  }
  if (contract.contracting_entities.length > 0) {
    const { nif } = parseNifNome(contract.contracting_entities[0]);
    entityId = entityMap.get(nif) ?? null;
  }
  if (contract.winners.length > 0) {
    const { nif } = parseNifNome(contract.winners[0]);
    winnerCompanyId = companyMap.get(nif) ?? null;
  }

  return { announcementId, entityId, winnerCompanyId };
}

async function loadExistingContracts(
  supabase: SupabaseClient,
  tenantId: string,
  baseContractIds: string[],
): Promise<Map<string, { id: string; raw_hash: string | null }>> {
  const existingMap = new Map<string, { id: string; raw_hash: string | null }>();

  for (let i = 0; i < baseContractIds.length; i += 500) {
    const chunk = baseContractIds.slice(i, i + 500);
    const { data } = await supabase
      .from("contracts")
      .select("id, base_contract_id, raw_hash")
      .eq("tenant_id", tenantId)
      .in("base_contract_id", chunk);

    (data ?? []).forEach((row: { id: string; base_contract_id: string; raw_hash: string | null }) => {
      existingMap.set(row.base_contract_id, { id: row.id, raw_hash: row.raw_hash });
    });
  }

  return existingMap;
}

async function loadAnnouncementMap(
  supabase: SupabaseClient,
  tenantId: string,
  announcementNos: string[],
): Promise<Map<string, string>> {
  const announcementMap = new Map<string, string>();

  for (let i = 0; i < announcementNos.length; i += 500) {
    const chunk = announcementNos.slice(i, i + 500);
    const { data } = await supabase
      .from("announcements")
      .select("id, dr_announcement_no")
      .eq("tenant_id", tenantId)
      .in("dr_announcement_no", chunk);

    (data ?? []).forEach((row: { id: string; dr_announcement_no: string }) => {
      if (row.dr_announcement_no) announcementMap.set(row.dr_announcement_no, row.id);
    });
  }

  return announcementMap;
}

async function ensureEntityMap(
  supabase: SupabaseClient,
  tenantId: string,
  contractsToWrite: ChunkItem[],
  stats: { entities_touched: number },
): Promise<Map<string, string>> {
  const entityNifs = new Set<string>();
  const nifNameMap = new Map<string, string>();

  for (const { contract } of contractsToWrite) {
    for (const raw of contract.contracting_entities) {
      const { nif, name } = parseNifNome(raw);
      if (!nif) continue;
      entityNifs.add(nif);
      if (name) nifNameMap.set(nif, name);
    }
  }

  const entityMap = new Map<string, string>();
  const nifArr = [...entityNifs];

  for (let i = 0; i < nifArr.length; i += 500) {
    const chunk = nifArr.slice(i, i + 500);
    const { data } = await supabase
      .from("entities")
      .select("id, nif")
      .eq("tenant_id", tenantId)
      .in("nif", chunk);

    (data ?? []).forEach((row: { id: string; nif: string }) => {
      entityMap.set(row.nif, row.id);
    });
  }

  const missingEntityNifs = nifArr.filter((nif) => !entityMap.has(nif));
  if (missingEntityNifs.length === 0) return entityMap;

  const entityRows = missingEntityNifs.map((nif) => ({
    tenant_id: tenantId,
    nif,
    name: nifNameMap.get(nif) ?? nif,
  }));

  for (let i = 0; i < entityRows.length; i += BATCH_SIZE) {
    const batch = entityRows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("entities")
      .upsert(batch, { onConflict: "tenant_id,nif", ignoreDuplicates: true })
      .select("id, nif");

    if (!error && data) {
      data.forEach((row: { id: string; nif: string }) => {
        entityMap.set(row.nif, row.id);
      });
      stats.entities_touched += data.length;
    }
  }

  return entityMap;
}

async function ensureCompanyMap(
  supabase: SupabaseClient,
  tenantId: string,
  contractsToWrite: ChunkItem[],
  stats: { companies_touched: number },
): Promise<Map<string, string>> {
  const companyNifs = new Set<string>();
  const nifNameMap = new Map<string, string>();

  for (const { contract } of contractsToWrite) {
    for (const raw of contract.winners) {
      const { nif, name } = parseNifNome(raw);
      if (!nif) continue;
      companyNifs.add(nif);
      if (name) nifNameMap.set(nif, name);
    }
  }

  const companyMap = new Map<string, string>();
  const nifArr = [...companyNifs];

  for (let i = 0; i < nifArr.length; i += 500) {
    const chunk = nifArr.slice(i, i + 500);
    const { data } = await supabase
      .from("companies")
      .select("id, nif")
      .eq("tenant_id", tenantId)
      .in("nif", chunk);

    (data ?? []).forEach((row: { id: string; nif: string }) => {
      companyMap.set(row.nif, row.id);
    });
  }

  const missingCompanyNifs = nifArr.filter((nif) => !companyMap.has(nif));
  if (missingCompanyNifs.length === 0) return companyMap;

  const companyRows = missingCompanyNifs.map((nif) => ({
    tenant_id: tenantId,
    nif,
    name: nifNameMap.get(nif) ?? nif,
  }));

  for (let i = 0; i < companyRows.length; i += BATCH_SIZE) {
    const batch = companyRows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("companies")
      .upsert(batch, { onConflict: "tenant_id,nif", ignoreDuplicates: true })
      .select("id, nif");

    if (!error && data) {
      data.forEach((row: { id: string; nif: string }) => {
        companyMap.set(row.nif, row.id);
      });
      stats.companies_touched += data.length;
    }
  }

  return companyMap;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const startedAt = Date.now();

  try {
    const body = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : {};

    const today = new Date();
    const minus7 = new Date(today);
    minus7.setDate(minus7.getDate() - 7);

    const fromDate: string = body.from_date ?? isoDate(minus7);
    const toDate: string = body.to_date ?? isoDate(today);
    const dryRun: boolean = body.dry_run === true;
    const yearFilter: number | undefined = body.year ? Number(body.year) : undefined;

    const rangeError = validateDateRange(fromDate, toDate);
    if (rangeError) {
      return new Response(JSON.stringify({ error: rangeError, limit_days: MAX_RANGE_DAYS }), {
        status: 400,
        headers: CORS,
      });
    }

    const supabase: SupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let tenantId: string = body.tenant_id ?? "";
    if (!tenantId) {
      const { data: tenant, error } = await supabase
        .from("tenants").select("id").limit(1).single();
      if (error || !tenant) {
        return new Response(
          JSON.stringify({ error: "No tenant found. Run admin-seed first." }),
          { status: 400, headers: CORS },
        );
      }
      tenantId = tenant.id;
    }

    const stats = {
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      linked_to_announcements: 0,
      entities_touched: 0,
      companies_touched: 0,
      errors: 0,
      dry_run: dryRun,
      elapsed_ms: 0,
    };

    console.log(`[ingest-contracts] tenant=${tenantId} from=${fromDate} to=${toDate} dry_run=${dryRun}`);
    console.log("[ingest-contracts] starting BASE API fetch...");

    const fetchStart = Date.now();
    let processed = 0;

    const fetchedCount = await forEachContractsChunk(
      fromDate,
      toDate,
      PROCESSING_CHUNK_SIZE,
      async (rawChunk) => {
        processed += rawChunk.length;
        console.log(`[ingest-contracts] mapped chunk ${processed - rawChunk.length + 1}-${processed}/${processed}`);

        const dedupedMap = new Map<string, ChunkItem>();
        const mappedChunk: ChunkItem[] = [];
        let mappedChunkCount = 0;

        for (const raw of rawChunk) {
          const contract = mapToContract(raw as Record<string, unknown>);
          const fingerprint = await computeContractFingerprint(contract);
          const item = { contract, fingerprint };
          mappedChunkCount++;

          const key = item.contract.base_contract_id;
          if (key) {
            dedupedMap.set(key, item);
          } else {
            mappedChunk.push(item);
          }
        }

        const dedupedById = [...dedupedMap.values()];
        const droppedDuplicates = mappedChunkCount - dedupedById.length - mappedChunk.length;
        if (droppedDuplicates > 0) {
          stats.skipped += droppedDuplicates;
          console.warn(`[ingest-contracts] dropped ${droppedDuplicates} duplicate base_contract_id entries inside chunk`);
        }
        mappedChunk.push(...dedupedById);

        const baseContractIds = [...new Set(
          mappedChunk
            .map((item) => item.contract.base_contract_id)
            .filter(Boolean) as string[],
        )];

        const existingMap = await loadExistingContracts(supabase, tenantId, baseContractIds);
        const toInsert: ChunkItem[] = [];
        const toUpdate: Array<ChunkItem & { existingId: string }> = [];

        for (const item of mappedChunk) {
          const existing = item.contract.base_contract_id
            ? existingMap.get(item.contract.base_contract_id)
            : undefined;

          if (!existing) {
            toInsert.push(item);
            continue;
          }

          if (existing.raw_hash !== item.fingerprint) {
            toUpdate.push({ ...item, existingId: existing.id });
            continue;
          }

          stats.skipped++;
        }

        const contractsToWrite: ChunkItem[] = [...toInsert, ...toUpdate];
        const announcementNos = [...new Set(
          contractsToWrite
            .map((item) => item.contract.base_announcement_no)
            .filter(Boolean) as string[],
        )];

        const announcementMap = announcementNos.length > 0
          ? await loadAnnouncementMap(supabase, tenantId, announcementNos)
          : new Map<string, string>();
        const entityMap = contractsToWrite.length > 0
          ? await ensureEntityMap(supabase, tenantId, contractsToWrite, stats)
          : new Map<string, string>();
        const companyMap = contractsToWrite.length > 0
          ? await ensureCompanyMap(supabase, tenantId, contractsToWrite, stats)
          : new Map<string, string>();

        if (!dryRun) {
          for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
            const batch = toInsert.slice(i, i + BATCH_SIZE).map(({ contract, fingerprint }) => {
              const { announcementId, entityId, winnerCompanyId } = resolveLinks(
                contract,
                announcementMap,
                entityMap,
                companyMap,
              );
              if (announcementId) stats.linked_to_announcements++;

              return {
                tenant_id: tenantId,
                source: "BASE_API",
                base_contract_id: contract.base_contract_id,
                base_procedure_id: contract.base_procedure_id,
                base_announcement_no: contract.base_announcement_no,
                base_incm_id: contract.base_incm_id,
                announcement_id: announcementId,
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
                entity_id: entityId,
                winner_company_id: winnerCompanyId,
                raw_payload: contract.raw_payload,
                raw_hash: fingerprint,
              };
            });

            const { error } = await supabase.from("contracts").insert(batch);
            if (error) {
              console.error(`[ingest-contracts] insert batch ${i / BATCH_SIZE + 1} error:`, error.message, error.details, error.hint, error.code);
              if (batch.length > 0) {
                const sample = batch[0];
                console.error("[ingest-contracts] sample:", sample.base_contract_id, sample.cpv_main, sample.publication_date);
              }
              stats.errors += batch.length;
            } else {
              stats.inserted += batch.length;
            }
          }

          for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
            const batch = toUpdate.slice(i, i + BATCH_SIZE);
            for (const { contract, fingerprint, existingId } of batch) {
              const { announcementId, entityId, winnerCompanyId } = resolveLinks(
                contract,
                announcementMap,
                entityMap,
                companyMap,
              );
              if (announcementId) stats.linked_to_announcements++;

              const { error } = await supabase
                .from("contracts")
                .update({
                  base_procedure_id: contract.base_procedure_id,
                  base_announcement_no: contract.base_announcement_no,
                  base_incm_id: contract.base_incm_id,
                  announcement_id: announcementId,
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
                  entity_id: entityId,
                  winner_company_id: winnerCompanyId,
                  raw_payload: contract.raw_payload,
                  raw_hash: fingerprint,
                })
                .eq("id", existingId);

              if (error) {
                console.error("[ingest-contracts] update error:", error.message, existingId);
                stats.errors++;
              } else {
                stats.updated++;
              }
            }
          }
        } else {
          stats.inserted += toInsert.length;
          stats.updated += toUpdate.length;
        }

        console.log(`[ingest-contracts] progress ${processed} inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped}`);
      },
      yearFilter,
    );

    stats.fetched = fetchedCount;
    console.log(`[ingest-contracts] fetched ${stats.fetched} items in ${Date.now() - fetchStart}ms`);
    stats.elapsed_ms = Date.now() - startedAt;
    console.log("[ingest-contracts] done:", stats);

    return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
  } catch (err) {
    console.error("[ingest-contracts] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
