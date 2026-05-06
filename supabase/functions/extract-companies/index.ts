/**
 * Edge Function: extract-companies
 *
 * Extrai e enriquece empresas adjudicatárias a partir dos contratos ingeridos.
 * Calcula estatísticas básicas: contratos ganhos, valor total, taxa de vitória,
 * especialização CPV e top entidades.
 *
 * Fontes:
 *   1. contracts.winners[]        → empresas que GANHARAM ("NIF - Nome")
 *   2. contracts.competitors      → empresas que PARTICIPARAM (texto)
 *   3. contracts.execution_locations → localização inferida
 *
 * Request body:
 *   {
 *     tenant_id?:   string,
 *     since_hours?: number   // processar apenas dados das últimas N horas (default: all)
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseNifNome } from "../_shared/baseApi.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const BATCH_SIZE = 200;

// ---------------------------------------------------------------------------
// Location extraction — find most frequent location from contracts
// ---------------------------------------------------------------------------

function mostFrequentLocation(locations: string[]): string | null {
  if (locations.length === 0) return null;

  const freq = new Map<string, number>();
  for (const loc of locations) {
    const parts = loc.split(",").map((s) => s.trim());
    const key = parts.length >= 3 ? `${parts[1]}, ${parts[2]}` : parts.length >= 2 ? parts[1] : loc;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  let best = "";
  let bestCount = 0;
  for (const [key, count] of freq) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best || null;
}

// ---------------------------------------------------------------------------
// Parse competitors text
// Competitors field is a free-text string — format varies.
// Common patterns: "NIF - Nome; NIF - Nome" or "NIF - Nome\nNIF - Nome"
// We try to split by common separators and parse each chunk.
// ---------------------------------------------------------------------------

function parseCompetitors(text: string | null): Array<{ nif: string; name: string }> {
  if (!text) return [];
  // Split by semicolons, newlines, or pipe
  const chunks = text.split(/[;\n|]/).map((s) => s.trim()).filter(Boolean);
  const result: Array<{ nif: string; name: string }> = [];
  for (const chunk of chunks) {
    // Only parse if it starts with digits (looks like a NIF)
    if (/^\d{5,}/.test(chunk)) {
      const parsed = parseNifNome(chunk);
      if (parsed.nif) result.push(parsed);
    }
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const startedAt = Date.now();

  try {
    const body = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : {};

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

    const sinceHours: number | null = body.since_hours ?? null;

    console.log(`[extract-companies] tenant=${tenantId} since_hours=${sinceHours}`);

    const stats = {
      contracts_scanned: 0,
      nifs_found: 0,
      companies_created: 0,
      companies_updated: 0,
      winners_extracted: 0,
      competitors_extracted: 0,
      locations_set: 0,
      errors: 0,
      elapsed_ms: 0,
    };

    // -----------------------------------------------------------------------
    // 1. Fetch all contracts
    // -----------------------------------------------------------------------
    let contractQuery = supabase
      .from("contracts")
      .select("winners, competitors, contracting_entities, execution_locations, contract_price, cpv_main, publication_date")
      .eq("tenant_id", tenantId);

    if (sinceHours) {
      const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
      contractQuery = contractQuery.gte("created_at", since);
    }

    const allContracts: Array<{
      winners: string[];
      competitors: string | null;
      contracting_entities: string[];
      execution_locations: string[];
      contract_price: number | null;
      cpv_main: string | null;
      publication_date: string | null;
    }> = [];

    let offset = 0;
    const fetchSize = 1000;
    while (true) {
      const { data: batch, error } = await contractQuery.range(offset, offset + fetchSize - 1);
      if (error) {
        console.error("[extract-companies] contracts query error:", error.message);
        break;
      }
      if (!batch || batch.length === 0) break;
      allContracts.push(...batch);
      if (batch.length < fetchSize) break;
      offset += fetchSize;
    }

    stats.contracts_scanned = allContracts.length;
    console.log(`[extract-companies] scanned ${allContracts.length} contracts`);

    // -----------------------------------------------------------------------
    // 2. Track company data per NIF
    // -----------------------------------------------------------------------
    interface CompanyData {
      name: string;
      contractsWon: number;
      contractsParticipated: number; // includes wins + competitor appearances
      totalValueWon: number;
      locations: string[];
      cpvs: Map<string, { count: number; value: number }>;
      entities: Map<string, { name: string; count: number; value: number }>;
      lastWinDate: string | null;
    }

    const companyData = new Map<string, CompanyData>();

    function getOrCreate(nif: string, name: string): CompanyData {
      let data = companyData.get(nif);
      if (!data) {
        data = {
          name,
          contractsWon: 0,
          contractsParticipated: 0,
          totalValueWon: 0,
          locations: [],
          cpvs: new Map(),
          entities: new Map(),
          lastWinDate: null,
        };
        companyData.set(nif, data);
      }
      // Update name if we have a better one
      if (name && data.name === nif) data.name = name;
      return data;
    }

    for (const c of allContracts) {
      const winners: string[] = Array.isArray(c.winners) ? c.winners : [];
      const locations: string[] = Array.isArray(c.execution_locations) ? c.execution_locations : [];
      const entities: string[] = Array.isArray(c.contracting_entities) ? c.contracting_entities : [];

      // Parse entity info for this contract
      const entityParsed = entities.length > 0 ? parseNifNome(entities[0]) : null;

      // Process winners
      for (const raw of winners) {
        const { nif, name } = parseNifNome(raw);
        if (!nif) continue;

        stats.winners_extracted++;
        const data = getOrCreate(nif, name);
        data.contractsWon++;
        data.contractsParticipated++;
        if (c.contract_price != null) data.totalValueWon += c.contract_price;
        data.locations.push(...locations);

        // Track CPV specialization
        if (c.cpv_main) {
          const cpvData = data.cpvs.get(c.cpv_main) ?? { count: 0, value: 0 };
          cpvData.count++;
          if (c.contract_price != null) cpvData.value += c.contract_price;
          data.cpvs.set(c.cpv_main, cpvData);
        }

        // Track top entities
        if (entityParsed) {
          const entData = data.entities.get(entityParsed.nif) ?? { name: entityParsed.name, count: 0, value: 0 };
          entData.count++;
          if (c.contract_price != null) entData.value += c.contract_price;
          data.entities.set(entityParsed.nif, entData);
        }

        // Last win date
        if (c.publication_date && (!data.lastWinDate || c.publication_date > data.lastWinDate)) {
          data.lastWinDate = c.publication_date;
        }
      }

      // Process competitors (participated but didn't win)
      const competitors = parseCompetitors(c.competitors);
      for (const { nif, name } of competitors) {
        stats.competitors_extracted++;
        const data = getOrCreate(nif, name);
        data.contractsParticipated++;
      }
    }

    stats.nifs_found = companyData.size;
    console.log(`[extract-companies] found ${companyData.size} unique company NIFs (${stats.winners_extracted} winner refs, ${stats.competitors_extracted} competitor refs)`);

    // -----------------------------------------------------------------------
    // 3. Load existing companies to determine create vs update
    // -----------------------------------------------------------------------
    const existingCompanies = new Map<string, { id: string; location: string | null }>();
    const nifArr = [...companyData.keys()];

    for (let i = 0; i < nifArr.length; i += 500) {
      const chunk = nifArr.slice(i, i + 500);
      const { data } = await supabase
        .from("companies")
        .select("id, nif, location")
        .eq("tenant_id", tenantId)
        .in("nif", chunk);
      (data ?? []).forEach((row: { id: string; nif: string; location: string | null }) => {
        existingCompanies.set(row.nif, { id: row.id, location: row.location });
      });
    }

    // -----------------------------------------------------------------------
    // 4. Build upsert rows
    // -----------------------------------------------------------------------
    const rows: Array<Record<string, unknown>> = [];

    for (const [nif, data] of companyData) {
      const existing = existingCompanies.get(nif);

      // Infer location
      const location = existing?.location ?? mostFrequentLocation(data.locations);
      if (location && !existing?.location) stats.locations_set++;

      // Win rate
      const winRate = data.contractsParticipated > 0
        ? Math.round((data.contractsWon / data.contractsParticipated) * 10000) / 100
        : null;

      // Average contract value
      const avgValue = data.contractsWon > 0
        ? Math.round((data.totalValueWon / data.contractsWon) * 100) / 100
        : null;

      // Build CPV specialization (top 10)
      const cpvSpec = [...data.cpvs.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([code, d]) => ({ code, count: d.count, value: Math.round(d.value * 100) / 100 }));

      // Build top entities (top 10)
      const topEntities = [...data.entities.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([entNif, d]) => ({ nif: entNif, name: d.name, count: d.count, value: Math.round(d.value * 100) / 100 }));

      const row: Record<string, unknown> = {
        tenant_id: tenantId,
        nif,
        name: data.name,
        location,
        contracts_won: data.contractsWon,
        contracts_participated: data.contractsParticipated,
        total_value_won: Math.round(data.totalValueWon * 100) / 100,
        avg_contract_value: avgValue,
        win_rate: winRate,
        last_win_at: data.lastWinDate
          ? new Date(data.lastWinDate).toISOString()
          : null,
        cpv_specialization: cpvSpec,
        top_entities: topEntities,
      };

      rows.push(row);

      if (existing) {
        stats.companies_updated++;
      } else {
        stats.companies_created++;
      }
    }

    // -----------------------------------------------------------------------
    // 5. Batch upsert
    // -----------------------------------------------------------------------
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("companies")
        .upsert(batch, { onConflict: "tenant_id,nif" });
      if (error) {
        console.error("[extract-companies] upsert batch error:", error.message);
        stats.errors += batch.length;
      }
    }

    stats.elapsed_ms = Date.now() - startedAt;
    console.log("[extract-companies] done:", stats);

    return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
  } catch (err) {
    console.error("[extract-companies] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
