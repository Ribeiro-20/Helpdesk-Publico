/**
 * Edge Function: extract-entities
 *
 * Extrai e enriquece entidades públicas a partir dos dados já ingeridos
 * (anúncios + contratos). Calcula estatísticas básicas e infere tipo/localização.
 *
 * Fontes:
 *   1. announcements: entity_nif + entity_name
 *   2. contracts: contracting_entities[] ("NIF - Nome"), execution_locations[]
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
// Entity type inference from name patterns
// ---------------------------------------------------------------------------

function inferEntityType(name: string): string | null {
  const n = name.toLowerCase();

  // Município / Câmara Municipal
  if (n.includes("câmara municipal") || n.includes("município") || n.includes("municipio")) {
    return "município";
  }
  // Junta de Freguesia
  if (n.includes("junta de freguesia") || n.includes("união de freguesias") || n.includes("uniao de freguesias")) {
    return "freguesia";
  }
  // Ministério
  if (n.includes("ministério") || n.includes("ministerio")) {
    return "ministério";
  }
  // Saúde
  if (
    n.includes("hospital") ||
    n.includes("centro hospitalar") ||
    n.includes("ars ") ||
    n.includes("aces ") ||
    n.includes("administração regional de saúde") ||
    n.includes("agrupamento de centros de saúde") ||
    n.includes("unidade local de saúde") ||
    n.includes("uls ")
  ) {
    return "saúde";
  }
  // Ensino
  if (
    n.includes("universidade") ||
    n.includes("politécnico") ||
    n.includes("politecnico") ||
    n.includes("escola superior") ||
    n.includes("instituto superior") ||
    n.includes("agrupamento de escolas")
  ) {
    return "ensino";
  }
  // Instituto
  if (n.includes("instituto") && !n.includes("instituto superior")) {
    return "instituto";
  }
  // Empresa pública — suffix patterns
  if (
    n.endsWith(", e.p.") ||
    n.endsWith(", ep") ||
    n.endsWith(", e.p.e.") ||
    n.endsWith(", epe") ||
    n.endsWith(", e.m.") ||
    n.endsWith(", em") ||
    n.endsWith(", s.a.") ||
    n.endsWith(", sa") ||
    n.includes(", e.p.e.,") ||
    n.includes(" - empresa municipal") ||
    n.includes(" - empresa pública")
  ) {
    return "empresa_publica";
  }
  // Autoridade / Regulador
  if (n.includes("autoridade") || n.includes("regulador")) {
    return "autoridade";
  }
  // Forças de segurança / Defesa
  if (
    n.includes("guarda nacional") ||
    n.includes("forças armadas") ||
    n.includes("exército") ||
    n.includes("marinha") ||
    n.includes("força aérea") ||
    n.includes("polícia")
  ) {
    return "defesa";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Location extraction — find most frequent location from contracts
// ---------------------------------------------------------------------------

function mostFrequentLocation(locations: string[]): string | null {
  if (locations.length === 0) return null;

  const freq = new Map<string, number>();
  for (const loc of locations) {
    // Format: "País, Distrito, Concelho" — take Distrito level
    const parts = loc.split(",").map((s) => s.trim());
    // Use "Distrito, Concelho" or just the raw value
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

    console.log(`[extract-entities] tenant=${tenantId} since_hours=${sinceHours}`);

    const stats = {
      nifs_found: 0,
      entities_created: 0,
      entities_updated: 0,
      types_inferred: {} as Record<string, number>,
      locations_set: 0,
      stats_updated: 0,
      errors: 0,
      elapsed_ms: 0,
    };

    // -----------------------------------------------------------------------
    // 1. Collect unique entity NIFs from announcements
    // -----------------------------------------------------------------------
    const entityInfo = new Map<string, { name: string; fromAnnouncements: boolean; fromContracts: boolean }>();

    // Fetch all announcement entity NIFs (paginated — PostgREST default limit is 1000)
    const allAnnEntities: Array<{ entity_nif: string | null; entity_name: string | null }> = [];
    {
      let annOffset = 0;
      const annFetchSize = 1000;
      while (true) {
        let annQuery = supabase
          .from("announcements")
          .select("entity_nif, entity_name")
          .eq("tenant_id", tenantId)
          .not("entity_nif", "is", null);

        if (sinceHours) {
          const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
          annQuery = annQuery.gte("created_at", since);
        }

        const { data: batch, error: annErr } = await annQuery.range(annOffset, annOffset + annFetchSize - 1);
        if (annErr) {
          console.error("[extract-entities] announcements query error:", annErr.message);
          break;
        }
        if (!batch || batch.length === 0) break;
        allAnnEntities.push(...batch);
        if (batch.length < annFetchSize) break;
        annOffset += annFetchSize;
      }
    }

    console.log(`[extract-entities] fetched ${allAnnEntities.length} announcement rows`);

    for (const row of allAnnEntities) {
      if (row.entity_nif) {
        const existing = entityInfo.get(row.entity_nif);
        if (!existing) {
          entityInfo.set(row.entity_nif, {
            name: row.entity_name ?? row.entity_nif,
            fromAnnouncements: true,
            fromContracts: false,
          });
        } else {
          existing.fromAnnouncements = true;
          // Update name if we have a better one
          if (row.entity_name && existing.name === row.entity_nif) {
            existing.name = row.entity_name;
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // 2. Collect unique entity NIFs from contracts
    // -----------------------------------------------------------------------
    let contractQuery = supabase
      .from("contracts")
      .select("contracting_entities, execution_locations, contract_price, cpv_main, publication_date, winners")
      .eq("tenant_id", tenantId);

    if (sinceHours) {
      const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
      contractQuery = contractQuery.gte("created_at", since);
    }

    // Fetch all contracts (paginated to handle large datasets)
    const allContracts: Array<{
      contracting_entities: string[];
      execution_locations: string[];
      contract_price: number | null;
      cpv_main: string | null;
      publication_date: string | null;
      winners: string[];
    }> = [];

    let offset = 0;
    const fetchSize = 1000;
    while (true) {
      const { data: batch, error } = await contractQuery.range(offset, offset + fetchSize - 1);
      if (error) {
        console.error("[extract-entities] contracts query error:", error.message);
        break;
      }
      if (!batch || batch.length === 0) break;
      allContracts.push(...batch);
      if (batch.length < fetchSize) break;
      offset += fetchSize;
    }

    // Track contract-level data per entity NIF for stats
    const entityContracts = new Map<string, {
      count: number;
      totalValue: number;
      locations: string[];
      cpvs: Map<string, number>;
      companies: Map<string, { name: string; count: number; value: number }>;
      lastDate: string | null;
    }>();

    for (const c of allContracts) {
      const entities: string[] = Array.isArray(c.contracting_entities) ? c.contracting_entities : [];
      const locations: string[] = Array.isArray(c.execution_locations) ? c.execution_locations : [];
      const winners: string[] = Array.isArray(c.winners) ? c.winners : [];

      for (const raw of entities) {
        const { nif, name } = parseNifNome(raw);
        if (!nif) continue;

        // Update entity info
        const existing = entityInfo.get(nif);
        if (!existing) {
          entityInfo.set(nif, { name, fromAnnouncements: false, fromContracts: true });
        } else {
          existing.fromContracts = true;
          if (name && existing.name === nif) existing.name = name;
        }

        // Track contract stats
        let contractData = entityContracts.get(nif);
        if (!contractData) {
          contractData = { count: 0, totalValue: 0, locations: [], cpvs: new Map(), companies: new Map(), lastDate: null };
          entityContracts.set(nif, contractData);
        }
        contractData.count++;
        if (c.contract_price != null) contractData.totalValue += c.contract_price;
        contractData.locations.push(...locations);
        if (c.cpv_main) {
          contractData.cpvs.set(c.cpv_main, (contractData.cpvs.get(c.cpv_main) ?? 0) + 1);
        }
        // Track winning companies for this entity
        for (const winnerRaw of winners) {
          const winner = parseNifNome(winnerRaw);
          if (!winner.nif) continue;
          const compData = contractData.companies.get(winner.nif) ?? { name: winner.name, count: 0, value: 0 };
          compData.count++;
          if (c.contract_price != null) compData.value += c.contract_price;
          contractData.companies.set(winner.nif, compData);
        }
        if (c.publication_date && (!contractData.lastDate || c.publication_date > contractData.lastDate)) {
          contractData.lastDate = c.publication_date;
        }
      }
    }

    // -----------------------------------------------------------------------
    // 3. Count announcements per entity NIF
    // -----------------------------------------------------------------------
    const entityAnnouncementCount = new Map<string, number>();
    for (const row of allAnnEntities) {
      if (row.entity_nif) {
        entityAnnouncementCount.set(
          row.entity_nif,
          (entityAnnouncementCount.get(row.entity_nif) ?? 0) + 1,
        );
      }
    }

    stats.nifs_found = entityInfo.size;
    console.log(`[extract-entities] found ${entityInfo.size} unique entity NIFs`);

    // -----------------------------------------------------------------------
    // 4. Load existing entities to determine create vs update
    // -----------------------------------------------------------------------
    const existingEntities = new Map<string, { id: string; entity_type: string | null; location: string | null }>();
    const nifArr = [...entityInfo.keys()];

    for (let i = 0; i < nifArr.length; i += 500) {
      const chunk = nifArr.slice(i, i + 500);
      const { data } = await supabase
        .from("entities")
        .select("id, nif, entity_type, location")
        .eq("tenant_id", tenantId)
        .in("nif", chunk);
      (data ?? []).forEach((row: { id: string; nif: string; entity_type: string | null; location: string | null }) => {
        existingEntities.set(row.nif, { id: row.id, entity_type: row.entity_type, location: row.location });
      });
    }

    // -----------------------------------------------------------------------
    // 5. Build upsert rows
    // -----------------------------------------------------------------------
    const rows: Array<Record<string, unknown>> = [];

    for (const [nif, info] of entityInfo) {
      const contractData = entityContracts.get(nif);
      const announcementCount = entityAnnouncementCount.get(nif) ?? 0;
      const existing = existingEntities.get(nif);

      // Infer entity type
      const inferredType = inferEntityType(info.name);
      const entityType = existing?.entity_type ?? inferredType;
      if (inferredType) {
        stats.types_inferred[inferredType] = (stats.types_inferred[inferredType] ?? 0) + 1;
      }

      // Infer location from most frequent execution_location
      const location = existing?.location ?? (contractData ? mostFrequentLocation(contractData.locations) : null);
      if (location && !existing?.location) stats.locations_set++;

      // Build top CPVs
      const topCpvs: Array<{ code: string; count: number }> = [];
      if (contractData) {
        const sorted = [...contractData.cpvs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        for (const [code, count] of sorted) {
          topCpvs.push({ code, count });
        }
      }

      // Build top companies (most awarded)
      const topCompanies: Array<{ nif: string; name: string; count: number; value: number }> = [];
      if (contractData) {
        const sorted = [...contractData.companies.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 10);
        for (const [compNif, d] of sorted) {
          topCompanies.push({ nif: compNif, name: d.name, count: d.count, value: Math.round(d.value * 100) / 100 });
        }
      }

      const totalContracts = contractData?.count ?? 0;
      const totalValue = contractData?.totalValue ?? 0;
      const avgValue = totalContracts > 0 ? Math.round((totalValue / totalContracts) * 100) / 100 : null;

      const row: Record<string, unknown> = {
        tenant_id: tenantId,
        nif,
        name: info.name,
        entity_type: entityType,
        location,
        total_announcements: announcementCount,
        total_contracts: totalContracts,
        total_value: totalValue,
        avg_contract_value: avgValue,
        top_cpvs: topCpvs,
        top_companies: topCompanies,
        last_activity_at: contractData?.lastDate
          ? new Date(contractData.lastDate).toISOString()
          : null,
      };

      rows.push(row);

      if (existing) {
        stats.entities_updated++;
      } else {
        stats.entities_created++;
      }
    }

    // -----------------------------------------------------------------------
    // 6. Batch upsert
    // -----------------------------------------------------------------------
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("entities")
        .upsert(batch, { onConflict: "tenant_id,nif" });
      if (error) {
        console.error("[extract-entities] upsert batch error:", error.message);
        stats.errors += batch.length;
      }
    }

    stats.stats_updated = rows.length - stats.errors;
    stats.elapsed_ms = Date.now() - startedAt;
    console.log("[extract-entities] done:", stats);

    return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
  } catch (err) {
    console.error("[extract-entities] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
