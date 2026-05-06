/**
 * Edge Function: ingest-contract-mods
 *
 * Ingere modificacoes contratuais a partir do endpoint GetInfoModContrat da API BASE.
 *
 * Request body:
 *   {
 *     tenant_id?:    string,
 *     year?:         number,     // default: ano corrente
 *     dry_run?:      boolean
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchContractModsByYear } from "../_shared/baseApi.ts";
import { computeHash } from "../_shared/canonicalJson.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const BATCH_SIZE = 200;

/** Parse DD/MM/YYYY -> YYYY-MM-DD */
function parsePtDate(str: string): string | null {
  const m = str?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parsePrice(val: unknown): number | null {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const startedAt = Date.now();

  try {
    const body = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : {};

    const year: number = body.year ?? new Date().getFullYear();
    const dryRun: boolean = body.dry_run === true;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Resolve tenant_id
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

    console.log(`[ingest-contract-mods] tenant=${tenantId} year=${year} dry_run=${dryRun}`);

    // 1. Fetch modifications from BASE API
    const rawItems = await fetchContractModsByYear(year);
    console.log(`[ingest-contract-mods] fetched ${rawItems.length} modifications for year ${year}`);

    const stats = {
      fetched: rawItems.length,
      inserted: 0,
      skipped: 0,
      contracts_updated: 0,
      total_price_delta: 0,
      errors: 0,
      dry_run: dryRun,
      elapsed_ms: 0,
    };

    if (dryRun || rawItems.length === 0) {
      if (dryRun) stats.inserted = rawItems.length;
      stats.elapsed_ms = Date.now() - startedAt;
      return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
    }

    // 2. Build a map of base_contract_id -> contract row for linking
    const contractIds = rawItems
      .map((item) => item.idContrato ? String(item.idContrato) : null)
      .filter(Boolean) as string[];

    const contractMap = new Map<string, { id: string; effective_price: number | null }>();

    if (contractIds.length > 0) {
      const uniqueIds = [...new Set(contractIds)];
      for (let i = 0; i < uniqueIds.length; i += 500) {
        const chunk = uniqueIds.slice(i, i + 500);
        const { data } = await supabase
          .from("contracts")
          .select("id, base_contract_id, effective_price")
          .eq("tenant_id", tenantId)
          .in("base_contract_id", chunk);
        (data ?? []).forEach((row: { id: string; base_contract_id: string; effective_price: number | null }) => {
          contractMap.set(row.base_contract_id, {
            id: row.id,
            effective_price: row.effective_price,
          });
        });
      }
    }

    // 3. Hash and dedup existing modifications
    const existingHashes = new Set<string>();
    {
      const contractDbIds = [...contractMap.values()].map((v) => v.id);
      for (let i = 0; i < contractDbIds.length; i += 500) {
        const chunk = contractDbIds.slice(i, i + 500);
        const { data } = await supabase
          .from("contract_modifications")
          .select("raw_hash")
          .eq("tenant_id", tenantId)
          .in("contract_id", chunk);
        (data ?? []).forEach((row: { raw_hash: string }) => {
          existingHashes.add(row.raw_hash);
        });
      }
    }

    // 4. Process each modification
    const toInsert: Array<{
      tenant_id: string;
      contract_id: string;
      base_contract_id: string;
      modification_no: number;
      description: string | null;
      reason: string | null;
      previous_price: number | null;
      new_price: number | null;
      price_delta: number | null;
      modification_date: string | null;
      raw_payload: Record<string, unknown>;
      raw_hash: string;
    }> = [];

    for (const raw of rawItems) {
      const payload = raw as Record<string, unknown>;
      const baseContractId = payload.idContrato ? String(payload.idContrato) : null;
      if (!baseContractId) {
        stats.errors++;
        continue;
      }

      const contract = contractMap.get(baseContractId);
      if (!contract) {
        // Contract not yet ingested — skip
        stats.skipped++;
        continue;
      }

      const hash = await computeHash(payload, ["updated_at", "created_at", "raw_hash"]);

      if (existingHashes.has(hash)) {
        stats.skipped++;
        continue;
      }

      const prevPrice = parsePrice(payload.precoAnterior ?? payload.valorAnterior);
      const newPrice = parsePrice(payload.precoNovo ?? payload.valorNovo ?? payload.PrecoTotalEfetivo);
      const priceDelta = prevPrice != null && newPrice != null ? newPrice - prevPrice : null;

      if (priceDelta != null) {
        stats.total_price_delta += priceDelta;
      }

      const modDate = parsePtDate(payload.dataModificacao as string ?? "") ??
                      parsePtDate(payload.dataPublicacao as string ?? "") ?? null;

      toInsert.push({
        tenant_id: tenantId,
        contract_id: contract.id,
        base_contract_id: baseContractId,
        modification_no: typeof payload.numeroModificacao === "number"
          ? payload.numeroModificacao
          : 1,
        description: (payload.descricao as string | undefined)?.trim() ??
                     (payload.objectoModificacao as string | undefined)?.trim() ?? null,
        reason: (payload.fundamentacao as string | undefined)?.trim() ?? null,
        previous_price: prevPrice,
        new_price: newPrice,
        price_delta: priceDelta,
        modification_date: modDate,
        raw_payload: payload,
        raw_hash: hash,
      });
    }

    // 5. Batch insert modifications
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("contract_modifications")
        .insert(batch);
      if (error) {
        console.error("[ingest-contract-mods] insert error:", error.message);
        stats.errors += batch.length;
      } else {
        stats.inserted += batch.length;
      }
    }

    // 6. Update contract status + effective_price for modified contracts
    const modifiedContractIds = new Set(toInsert.map((m) => m.contract_id));
    for (const contractId of modifiedContractIds) {
      // Get the latest modification's new_price
      const mods = toInsert.filter((m) => m.contract_id === contractId);
      const latestMod = mods[mods.length - 1];

      const updateFields: Record<string, unknown> = { status: "modified" };
      if (latestMod?.new_price != null) {
        updateFields.effective_price = latestMod.new_price;
      }

      const { error } = await supabase
        .from("contracts")
        .update(updateFields)
        .eq("id", contractId);

      if (!error) stats.contracts_updated++;
    }

    stats.elapsed_ms = Date.now() - startedAt;
    console.log("[ingest-contract-mods] done:", stats);

    return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
  } catch (err) {
    console.error("[ingest-contract-mods] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
