/**
 * Edge Function: compute-stats
 *
 * Recalcula todas as estatísticas agregadas do sistema.
 * Esta é a função que transforma dados brutos em inteligência de mercado.
 *
 * == O QUE CALCULA ==
 *
 * 1. CPV_STATS (tabela cpv_stats)
 *    Para cada código CPV com actividade:
 *    - total_announcements, announcements_last_30d, announcements_last_365d
 *    - total_contracts, contracts_last_30d, contracts_last_365d
 *    - total_value, avg/min/max/median_contract_value
 *    - avg_price_ratio (preço_contratual / preço_base)
 *    - avg_discount_pct (desconto médio face ao preço base)
 *    - total_entities, total_companies (únicos)
 *    - top_entities: Top 10 entidades que mais compram neste CPV
 *    - top_companies: Top 10 empresas que mais ganham neste CPV
 *    - yoy_growth_pct: crescimento anual (comparando últimos 12m com 12m anteriores)
 *
 * 2. ENTITY STATS (campos desnormalizados em entities)
 *    Para cada entidade pública:
 *    - total_announcements: contagem de anúncios publicados
 *    - total_contracts: contagem de contratos celebrados
 *    - total_value: valor total contratado
 *    - avg_contract_value: valor médio por contrato
 *    - last_activity_at: data do último anúncio/contrato
 *    - top_cpvs: Top 10 CPVs mais frequentes [{code, count, description}]
 *    - top_companies: Top 10 empresas adjudicadas [{nif, name, count, value}]
 *
 * 3. COMPANY STATS (campos desnormalizados em companies)
 *    Para cada empresa adjudicatária:
 *    - contracts_won: total de contratos ganhos
 *    - contracts_participated: total de participações (se dados disponíveis)
 *    - total_value_won: valor total de contratos ganhos
 *    - avg_contract_value: valor médio por contrato
 *    - win_rate: taxa de vitória (%)
 *    - last_win_at: data do último contrato ganho
 *    - cpv_specialization: Top CPVs [{code, count, value, description}]
 *    - top_entities: Top entidades com quem contrata [{nif, name, count, value}]
 *
 * == ESTRATÉGIA DE CÁLCULO ==
 * - Full recompute: recalcula tudo do zero (mais lento, mais preciso)
 * - Incremental: só atualiza registos afetados por novos dados (mais rápido)
 * - O modo é controlado pelo parâmetro mode (default: incremental)
 *
 * == QUERIES PRINCIPAIS ==
 * - Agregações SQL sobre announcements, contracts, entities, companies
 * - GROUP BY cpv_code para cpv_stats
 * - JOIN contracts → entities via entity_id para stats de entidade
 * - JOIN contracts → companies via winner_company_id para stats de empresa
 * - Cálculo de mediana via PERCENTILE_CONT(0.5)
 * - Crescimento YoY: COUNT(last 12m) / COUNT(previous 12m) - 1
 *
 * == VALOR PARA O UTILIZADOR ==
 * - Dashboard de mercado com visão agregada
 * - Comparação entre sectores CPV
 * - Identificação de tendências (mercados em crescimento/declínio)
 * - Previsão de preço competitivo (via análise de desconto médio)
 * - Ranking de entidades e empresas por volume
 *
 * == TABELAS DESTINO ==
 * - cpv_stats (upsert completo)
 * - entities (update campos estatísticos)
 * - companies (update campos estatísticos)
 *
 * == SCHEDULE ==
 * A correr diariamente às 03:00 (após todas as ingestões do dia)
 *
 * Request body:
 *   {
 *     tenant_id?:  string,
 *     mode?:       "full" | "incremental",  // default: incremental
 *     target?:     "all" | "cpv" | "entities" | "companies",  // default: all
 *   }
 *
 * Response:
 *   {
 *     mode: string,
 *     cpv_stats_upserted: number,
 *     entities_updated: number,
 *     companies_updated: number,
 *     elapsed_ms: number
 *   }
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

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

type Party = { nif: string | null; name: string };

type ContractRow = {
  cpv_main: string | null;
  contract_price: number | null;
  base_price: number | null;
  signing_date: string | null;
  publication_date: string | null;
  contracting_entities: unknown;
  winners: unknown;
};

type AnnouncementRow = {
  cpv_main: string | null;
  publication_date: string | null;
};

type CpvStatRow = {
  tenant_id: string;
  cpv_code: string;
  cpv_description: string | null;
  cpv_division: string | null;
  total_announcements: number;
  announcements_last_30d: number;
  announcements_last_365d: number;
  total_contracts: number;
  contracts_last_30d: number;
  contracts_last_365d: number;
  total_value: number;
  avg_contract_value: number | null;
  min_contract_value: number | null;
  max_contract_value: number | null;
  median_contract_value: number | null;
  avg_price_ratio: number | null;
  avg_discount_pct: number | null;
  total_entities: number;
  total_companies: number;
  top_entities: Array<{ nif: string | null; name: string; count: number; value: number }>;
  top_companies: Array<{ nif: string | null; name: string; count: number; value: number }>;
  yoy_growth_pct: number | null;
  computed_at: string;
};

type CpvAgg = {
  code: string;
  prices: number[];
  totalAnnouncements: number;
  announcementsLast30d: number;
  announcementsLast365d: number;
  totalContracts: number;
  contractsLast30d: number;
  contractsLast365d: number;
  totalValue: number;
  ratioSum: number;
  ratioCount: number;
  discountSum: number;
  discountCount: number;
  countLast12m: number;
  countPrev12m: number;
  entitiesSet: Set<string>;
  companiesSet: Set<string>;
  entitiesAgg: Map<string, { nif: string | null; name: string; count: number; value: number }>;
  companiesAgg: Map<string, { nif: string | null; name: string; count: number; value: number }>;
};

function normalizeCpvCode(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return "";
  const idx = trimmed.indexOf(" - ");
  return (idx === -1 ? trimmed : trimmed.slice(0, idx)).trim();
}

function cpvDivision(code: string): string | null {
  const digits = code.replace(/\D/g, "");
  return digits.length >= 2 ? digits.slice(0, 2) : null;
}

function toDateOrNull(dateLike: string | null | undefined): Date | null {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  return Number.isNaN(d.getTime()) ? null : d;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function parsePartyEntry(raw: unknown): Party | null {
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) return null;
    const match = value.match(/^([^\-]+?)\s*-\s*(.+)$/);
    if (match) {
      const nif = match[1].trim() || null;
      const name = match[2].trim();
      return name ? { nif, name } : null;
    }
    return { nif: null, name: value };
  }

  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    if (!name) return null;
    const nifRaw = record.nif;
    const nif = nifRaw == null ? null : String(nifRaw).trim() || null;
    return { nif, name };
  }

  return null;
}

function toPartyArray(raw: unknown): Party[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parsePartyEntry).filter((item): item is Party => Boolean(item));
}

function getOrCreateAgg(map: Map<string, CpvAgg>, code: string): CpvAgg {
  const existing = map.get(code);
  if (existing) return existing;

  const created: CpvAgg = {
    code,
    prices: [],
    totalAnnouncements: 0,
    announcementsLast30d: 0,
    announcementsLast365d: 0,
    totalContracts: 0,
    contractsLast30d: 0,
    contractsLast365d: 0,
    totalValue: 0,
    ratioSum: 0,
    ratioCount: 0,
    discountSum: 0,
    discountCount: 0,
    countLast12m: 0,
    countPrev12m: 0,
    entitiesSet: new Set<string>(),
    companiesSet: new Set<string>(),
    entitiesAgg: new Map(),
    companiesAgg: new Map(),
  };

  map.set(code, created);
  return created;
}

async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: "contracts" | "announcements" | "cpv_codes",
  columns: string,
  tenantId?: string,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (tenantId) query = query.eq("tenant_id", tenantId);

    const { data, error } = await query;
    if (error) throw error;

    const chunk = (data ?? []) as T[];
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  return rows;
}

function topParties(map: Map<string, { nif: string | null; name: string; count: number; value: number }>) {
  return Array.from(map.values())
    .sort((a, b) => (b.value - a.value) || (b.count - a.count))
    .slice(0, 10)
    .map((item) => ({ nif: item.nif, name: item.name, count: item.count, value: item.value }));
}

async function computeTenantCpvStats(supabase: SupabaseClient, tenantId: string): Promise<number> {
  const now = new Date();
  const last30d = new Date(now);
  last30d.setDate(last30d.getDate() - 30);
  const last365d = new Date(now);
  last365d.setDate(last365d.getDate() - 365);
  const last12m = new Date(now);
  last12m.setFullYear(last12m.getFullYear() - 1);
  const prev12m = new Date(now);
  prev12m.setFullYear(prev12m.getFullYear() - 2);

  const [contracts, announcements] = await Promise.all([
    fetchAllRows<ContractRow>(
      supabase,
      "contracts",
      "cpv_main, contract_price, base_price, signing_date, publication_date, contracting_entities, winners",
      tenantId,
    ),
    fetchAllRows<AnnouncementRow>(
      supabase,
      "announcements",
      "cpv_main, publication_date",
      tenantId,
    ),
  ]);

  const agg = new Map<string, CpvAgg>();

  for (const row of announcements) {
    const code = normalizeCpvCode(row.cpv_main);
    if (!code) continue;

    const refDate = toDateOrNull(row.publication_date);
    const current = getOrCreateAgg(agg, code);

    current.totalAnnouncements += 1;
    if (refDate && refDate >= last30d) current.announcementsLast30d += 1;
    if (refDate && refDate >= last365d) current.announcementsLast365d += 1;
  }

  for (const row of contracts) {
    const code = normalizeCpvCode(row.cpv_main);
    if (!code) continue;

    const contractValue = row.contract_price == null ? null : Number(row.contract_price);
    const baseValue = row.base_price == null ? null : Number(row.base_price);
    const safeContractValue = contractValue != null && Number.isFinite(contractValue) ? contractValue : 0;
    const refDate = toDateOrNull(row.signing_date) ?? toDateOrNull(row.publication_date);

    const current = getOrCreateAgg(agg, code);
    current.totalContracts += 1;
    current.totalValue += safeContractValue;

    if (contractValue != null && Number.isFinite(contractValue) && contractValue >= 0) {
      current.prices.push(contractValue);
    }

    if (refDate && refDate >= last30d) current.contractsLast30d += 1;
    if (refDate && refDate >= last365d) current.contractsLast365d += 1;
    if (refDate && refDate >= last12m) {
      current.countLast12m += 1;
    } else if (refDate && refDate >= prev12m && refDate < last12m) {
      current.countPrev12m += 1;
    }

    if (
      contractValue != null &&
      baseValue != null &&
      Number.isFinite(contractValue) &&
      Number.isFinite(baseValue) &&
      baseValue > 0
    ) {
      const ratio = contractValue / baseValue;
      const discountPct = (1 - ratio) * 100;
      current.ratioSum += ratio;
      current.ratioCount += 1;
      current.discountSum += discountPct;
      current.discountCount += 1;
    }

    const entities = toPartyArray(row.contracting_entities);
    const seenEntities = new Set<string>();
    for (const item of entities) {
      const key = (item.nif ?? item.name).toLowerCase();
      if (seenEntities.has(key)) continue;
      seenEntities.add(key);

      current.entitiesSet.add(key);
      const entityAgg = current.entitiesAgg.get(key) ?? { nif: item.nif, name: item.name, count: 0, value: 0 };
      entityAgg.count += 1;
      entityAgg.value += safeContractValue;
      current.entitiesAgg.set(key, entityAgg);
    }

    const winners = toPartyArray(row.winners);
    const seenWinners = new Set<string>();
    for (const item of winners) {
      const key = (item.nif ?? item.name).toLowerCase();
      if (seenWinners.has(key)) continue;
      seenWinners.add(key);

      current.companiesSet.add(key);
      const companyAgg = current.companiesAgg.get(key) ?? { nif: item.nif, name: item.name, count: 0, value: 0 };
      companyAgg.count += 1;
      companyAgg.value += safeContractValue;
      current.companiesAgg.set(key, companyAgg);
    }
  }

  const cpvCodes = Array.from(agg.keys());
  const cpvDescriptionMap = new Map<string, string>();
  if (cpvCodes.length > 0) {
    for (let i = 0; i < cpvCodes.length; i += 500) {
      const chunk = cpvCodes.slice(i, i + 500);
      const { data, error } = await supabase
        .from("cpv_codes")
        .select("id, descricao")
        .in("id", chunk);
      if (error) throw error;
      for (const row of data ?? []) {
        const item = row as { id: string; descricao: string };
        cpvDescriptionMap.set(item.id, item.descricao);
      }
    }
  }

  const computedAt = new Date().toISOString();
  const rows: CpvStatRow[] = cpvCodes.map((code) => {
    const item = agg.get(code)!;
    const avgContractValue = item.totalContracts > 0 ? item.totalValue / item.totalContracts : null;
    const avgPriceRatio = item.ratioCount > 0 ? item.ratioSum / item.ratioCount : null;
    const avgDiscountPct = item.discountCount > 0 ? item.discountSum / item.discountCount : null;
    const yoyGrowthPct = item.countPrev12m > 0
      ? ((item.countLast12m - item.countPrev12m) / item.countPrev12m) * 100
      : null;

    return {
      tenant_id: tenantId,
      cpv_code: code,
      cpv_description: cpvDescriptionMap.get(code) ?? null,
      cpv_division: cpvDivision(code),
      total_announcements: item.totalAnnouncements,
      announcements_last_30d: item.announcementsLast30d,
      announcements_last_365d: item.announcementsLast365d,
      total_contracts: item.totalContracts,
      contracts_last_30d: item.contractsLast30d,
      contracts_last_365d: item.contractsLast365d,
      total_value: item.totalValue,
      avg_contract_value: avgContractValue,
      min_contract_value: item.prices.length > 0 ? Math.min(...item.prices) : null,
      max_contract_value: item.prices.length > 0 ? Math.max(...item.prices) : null,
      median_contract_value: percentile(item.prices, 0.5),
      avg_price_ratio: avgPriceRatio,
      avg_discount_pct: avgDiscountPct,
      total_entities: item.entitiesSet.size,
      total_companies: item.companiesSet.size,
      top_entities: topParties(item.entitiesAgg),
      top_companies: topParties(item.companiesAgg),
      yoy_growth_pct: yoyGrowthPct,
      computed_at: computedAt,
    };
  });

  const { error: deleteError } = await supabase
    .from("cpv_stats")
    .delete()
    .eq("tenant_id", tenantId);
  if (deleteError) throw deleteError;

  if (rows.length === 0) return 0;

  const batchSize = 250;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("cpv_stats").insert(batch);
    if (error) throw error;
    inserted += batch.length;
  }

  return inserted;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const requestedTarget = String(body?.target ?? "all");

    if (requestedTarget !== "all" && requestedTarget !== "cpv") {
      return new Response(
        JSON.stringify({
          mode: String(body?.mode ?? "full"),
          target: requestedTarget,
          cpv_stats_upserted: 0,
          entities_updated: 0,
          companies_updated: 0,
          elapsed_ms: 0,
          skipped: true,
          reason: "compute-stats implementa atualmente apenas target=cpv|all",
        }),
        { status: 200, headers: CORS },
      );
    }

    const startedAt = Date.now();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const requestedTenantId = String(body?.tenant_id ?? "").trim();
    let tenantIds: string[] = [];

    if (requestedTenantId) {
      tenantIds = [requestedTenantId];
    } else {
      const { data: tenants, error } = await supabase
        .from("tenants")
        .select("id");
      if (error) throw error;
      tenantIds = (tenants ?? []).map((t: { id: string }) => t.id);
    }

    let cpvStatsUpserted = 0;
    for (const tenantId of tenantIds) {
      const inserted = await computeTenantCpvStats(supabase, tenantId);
      cpvStatsUpserted += inserted;
      console.log(`[compute-stats] tenant=${tenantId} cpv_rows=${inserted}`);
    }

    return new Response(
      JSON.stringify({
        mode: String(body?.mode ?? "full"),
        target: requestedTarget,
        tenants_processed: tenantIds.length,
        cpv_stats_upserted: cpvStatsUpserted,
        entities_updated: 0,
        companies_updated: 0,
        elapsed_ms: Date.now() - startedAt,
      }),
      { status: 200, headers: CORS },
    );
  } catch (err) {
    console.error("[compute-stats] fatal:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
