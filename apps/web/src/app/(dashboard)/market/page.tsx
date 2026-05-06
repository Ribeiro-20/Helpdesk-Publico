import { createClient } from "../../../lib/supabase/server";
import { TrendingUp } from "lucide-react";
import PageHeader from "../../../components/layout/PageHeader";
import MarketInsightPanel from "../../../components/market/MarketInsightPanel";
import CpvCarouselHints from "../../../components/market/CpvCarouselHints";
import MarketOverviewPanel from "../../../components/market/MarketOverviewPanel";
import MarketChartsPanel from "../../../components/market/MarketChartsPanel";

export const dynamic = "force-dynamic";

type TopParty = {
  nif?: string | null;
  name?: string | null;
  count?: number | null;
  value?: number | null;
};

type ContractForStats = {
  cpv_main: string | null;
  cpv_list: unknown;
  contract_price: number | null;
  base_price: number | null;
  signing_date: string | null;
  publication_date: string | null;
  contracting_entities: unknown;
  winners: unknown;
};

type ContractForOverview = {
  cpv_main: string | null;
  contract_price: number | null;
  base_price: number | null;
};

type ContractForCharts = {
  signing_date: string | null;
  contract_price: number | null;
  execution_locations: unknown;
  procedure_type: string | null;
};

type CpvStatsForOverview = {
  cpv_code: string;
  cpv_description: string | null;
  total_contracts: number;
  total_value: number;
  avg_contract_value: number | null;
  avg_discount_pct: number | null;
};

async function fetchAllContractsForTenant<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  columns: string,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data } = await supabase
      .from("contracts")
      .select(columns)
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);

    const chunk = (data ?? []) as T[];
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  return rows;
}

async function fetchAllCpvStatsForTenant<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  columns: string,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data } = await supabase
      .from("cpv_stats")
      .select(columns)
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);

    const chunk = (data ?? []) as T[];
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  return rows;
}

function parseTopParties(raw: unknown): TopParty[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is TopParty => typeof item === "object" && item !== null)
    .slice(0, 5);
}

function deriveCpvFamilyPrefix(input: string): string {
  const normalized = input.trim();
  if (!normalized) return "";

  const digits = normalized.replace(/\D/g, "").slice(0, 8);
  if (digits.length < 2) return normalized;

  const withoutTrailingZeros = digits.replace(/0+$/, "");
  if (withoutTrailingZeros.length >= 2) return withoutTrailingZeros;

  return digits.slice(0, 2);
}

function deriveCpvFallbackPrefixes(input: string): string[] {
  const normalized = input.trim();
  if (!normalized) return [];

  const digits = normalized.replace(/\D/g, "").slice(0, 8);
  if (digits.length < 2) return [];

  const base = deriveCpvFamilyPrefix(input);
  if (!base) return [];

  const prefixes: string[] = [];
  for (let len = base.length; len >= 2; len--) {
    prefixes.push(base.slice(0, len));
  }

  return Array.from(new Set(prefixes));
}

function normalizeCpvInput(input: string): string {
  return input.trim().toUpperCase();
}

function normalizeCpvCode(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return "";
  const idx = trimmed.indexOf(" - ");
  return (idx === -1 ? trimmed : trimmed.slice(0, idx)).trim();
}

function parseCpvArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim().toUpperCase() : ""))
    .filter(Boolean);
}

function parsePartyEntry(raw: unknown): { nif: string | null; name: string } | null {
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

function toPartyArray(raw: unknown): { nif: string | null; name: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parsePartyEntry).filter((item): item is { nif: string | null; name: string } => Boolean(item));
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

function toDateOrNull(dateLike: string | null | undefined): Date | null {
  if (!dateLike) return null;
  const date = new Date(dateLike);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeFallbackInsight(cpvCode: string, cpvDescription: string | null, rows: ContractForStats[]) {
  const prices: number[] = [];
  let totalValue = 0;
  let contractsLast365d = 0;
  let ratioCount = 0;
  let discountSum = 0;

  const now = new Date();
  const last365d = new Date(now);
  last365d.setDate(last365d.getDate() - 365);
  const last12m = new Date(now);
  last12m.setFullYear(last12m.getFullYear() - 1);
  const prev12m = new Date(now);
  prev12m.setFullYear(prev12m.getFullYear() - 2);

  let countLast12m = 0;
  let countPrev12m = 0;

  const entitiesAgg = new Map<string, { nif: string | null; name: string; count: number; value: number }>();
  const companiesAgg = new Map<string, { nif: string | null; name: string; count: number; value: number }>();

  for (const row of rows) {
    const contractValue = row.contract_price == null ? null : Number(row.contract_price);
    const baseValue = row.base_price == null ? null : Number(row.base_price);
    const refDate = toDateOrNull(row.signing_date) ?? toDateOrNull(row.publication_date);

    if (contractValue != null && Number.isFinite(contractValue) && contractValue >= 0) {
      prices.push(contractValue);
      totalValue += contractValue;
    }

    if (refDate) {
      if (refDate >= last365d) contractsLast365d++;
      if (refDate >= last12m) {
        countLast12m++;
      } else if (refDate >= prev12m && refDate < last12m) {
        countPrev12m++;
      }
    }

    if (baseValue != null && contractValue != null && Number.isFinite(baseValue) && Number.isFinite(contractValue) && baseValue > 0) {
      discountSum += (1 - contractValue / baseValue) * 100;
      ratioCount++;
    }

    const valueToAdd = contractValue != null && Number.isFinite(contractValue) ? contractValue : 0;

    const entityEntries = toPartyArray(row.contracting_entities);
    const seenEntities = new Set<string>();
    for (const entry of entityEntries) {
      const key = (entry.nif ?? entry.name).toLowerCase();
      if (seenEntities.has(key)) continue;
      seenEntities.add(key);

      const current = entitiesAgg.get(key) ?? { nif: entry.nif, name: entry.name, count: 0, value: 0 };
      current.count += 1;
      current.value += valueToAdd;
      entitiesAgg.set(key, current);
    }

    const winnerEntries = toPartyArray(row.winners);
    const seenWinners = new Set<string>();
    for (const entry of winnerEntries) {
      const key = (entry.nif ?? entry.name).toLowerCase();
      if (seenWinners.has(key)) continue;
      seenWinners.add(key);

      const current = companiesAgg.get(key) ?? { nif: entry.nif, name: entry.name, count: 0, value: 0 };
      current.count += 1;
      current.value += valueToAdd;
      companiesAgg.set(key, current);
    }
  }

  const totalContracts = rows.length;
  const avgContractValue = totalContracts > 0 ? totalValue / totalContracts : null;
  const yoyGrowthPct = countPrev12m > 0 ? ((countLast12m - countPrev12m) / countPrev12m) * 100 : null;
  const avgDiscountPct = ratioCount > 0 ? discountSum / ratioCount : null;

  const topEntities = Array.from(entitiesAgg.values())
    .sort((a, b) => (b.value - a.value) || (b.count - a.count))
    .slice(0, 5)
    .map((item) => ({ nif: item.nif, name: item.name, count: item.count, value: item.value }));

  const topCompanies = Array.from(companiesAgg.values())
    .sort((a, b) => (b.value - a.value) || (b.count - a.count))
    .slice(0, 5)
    .map((item) => ({ nif: item.nif, name: item.name, count: item.count, value: item.value }));

  return {
    cpv_code: cpvCode,
    cpv_description: cpvDescription,
    cpv_division: cpvCode.slice(0, 2) || null,
    total_contracts: totalContracts,
    contracts_last_365d: contractsLast365d,
    total_value: totalValue,
    avg_contract_value: avgContractValue,
    avg_discount_pct: avgDiscountPct,
    yoy_growth_pct: yoyGrowthPct,
    min_contract_value: prices.length > 0 ? Math.min(...prices) : null,
    median_contract_value: percentile(prices, 0.5),
    max_contract_value: prices.length > 0 ? Math.max(...prices) : null,
    top_entities: topEntities,
    top_companies: topCompanies,
    computed_at: new Date().toISOString(),
  };
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ cpv?: string }>;
}) {
  const params = await searchParams;
  const cpvFilter = normalizeCpvInput(params.cpv ?? "");
  const cpvFamilyPrefix = deriveCpvFamilyPrefix(cpvFilter);
  const cpvFamilyLike = cpvFamilyPrefix ? `${cpvFamilyPrefix}%` : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id, role")
    .eq("id", user!.id)
    .maybeSingle();

  const tenantId = appUser?.tenant_id;

  let totalCpvStats = 0;
  let cpvCarouselItems: Array<{ code: string; description: string | null; contracts: number; totalValue: number }> = [];
  let monthlyData: Array<{ month: string; contracts: number; value: number }> = [];
  let procedureData: Array<{ type: string; contracts: number; value: number }> = [];
  let districtData: Array<{ district: string; contracts: number }> = [];
  let marketOverview: {
    totalContracts: number;
    totalValue: number;
    activeCpvs: number;
    avgDiscountPct: number | null;
    items: Array<{
      code: string;
      description: string | null;
      contracts: number;
      totalValue: number;
      avgContractValue: number;
      avgDiscountPct: number | null;
    }>;
  } | null = null;
  let cpvCatalogMatch: { id: string; descricao: string } | null = null;
  let isRealtimeFallback = false;
  let cpvInsight: {
    cpv_code: string;
    cpv_description: string | null;
    cpv_division: string | null;
    total_contracts: number;
    contracts_last_365d: number;
    total_value: number;
    avg_contract_value: number | null;
    avg_discount_pct: number | null;
    yoy_growth_pct: number | null;
    min_contract_value: number | null;
    median_contract_value: number | null;
    max_contract_value: number | null;
    top_entities: unknown;
    top_companies: unknown;
    computed_at: string | null;
  } | null = null;

  if (tenantId) {
    const { count } = await supabase
      .from("cpv_stats")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    totalCpvStats = count ?? 0;

    const cpvStatsOverviewRows = await fetchAllCpvStatsForTenant<CpvStatsForOverview>(
      supabase,
      tenantId,
      "cpv_code, cpv_description, total_contracts, total_value, avg_contract_value, avg_discount_pct",
    );

    if (cpvStatsOverviewRows.length > 0) {
      const totalContractsOverview = cpvStatsOverviewRows.reduce((sum, row) => sum + Number(row.total_contracts ?? 0), 0);
      const totalValueOverview = cpvStatsOverviewRows.reduce((sum, row) => sum + Number(row.total_value ?? 0), 0);
      const discountRows = cpvStatsOverviewRows.filter((row) => row.avg_discount_pct != null);
      const avgDiscountOverview = discountRows.length > 0
        ? discountRows.reduce((sum, row) => sum + Number(row.avg_discount_pct ?? 0), 0) / discountRows.length
        : null;

      const overviewItems = cpvStatsOverviewRows
        .map((row) => ({
          code: row.cpv_code,
          description: row.cpv_description,
          contracts: Number(row.total_contracts ?? 0),
          totalValue: Number(row.total_value ?? 0),
          avgContractValue: Number(row.avg_contract_value ?? 0),
          avgDiscountPct: row.avg_discount_pct == null ? null : Number(row.avg_discount_pct),
        }))
        .sort((a, b) => (b.contracts - a.contracts) || (b.totalValue - a.totalValue))
        .slice(0, 16);

      marketOverview = {
        totalContracts: totalContractsOverview,
        totalValue: totalValueOverview,
        activeCpvs: cpvStatsOverviewRows.length,
        avgDiscountPct: avgDiscountOverview,
        items: overviewItems,
      };
    } else {
      const overviewRows = (await fetchAllContractsForTenant<ContractForOverview>(
        supabase,
        tenantId,
        "cpv_main, contract_price, base_price",
      )).filter((row) => row.cpv_main != null);

      const overviewAgg = new Map<string, { contracts: number; totalValue: number; discountSum: number; discountCount: number }>();
      let overviewTotalContracts = 0;
      let overviewTotalValue = 0;
      let overviewDiscountSum = 0;
      let overviewDiscountCount = 0;

      for (const row of overviewRows) {
        const code = normalizeCpvCode(row.cpv_main);
        if (!code) continue;

        const contractValue = row.contract_price == null ? null : Number(row.contract_price);
        const baseValue = row.base_price == null ? null : Number(row.base_price);
        const safeContractValue = contractValue != null && Number.isFinite(contractValue) ? contractValue : 0;

        overviewTotalContracts += 1;
        overviewTotalValue += safeContractValue;

        const current = overviewAgg.get(code) ?? { contracts: 0, totalValue: 0, discountSum: 0, discountCount: 0 };
        current.contracts += 1;
        current.totalValue += safeContractValue;

        if (
          contractValue != null &&
          baseValue != null &&
          Number.isFinite(contractValue) &&
          Number.isFinite(baseValue) &&
          baseValue > 0
        ) {
          const discount = (1 - contractValue / baseValue) * 100;
          current.discountSum += discount;
          current.discountCount += 1;
          overviewDiscountSum += discount;
          overviewDiscountCount += 1;
        }

        overviewAgg.set(code, current);
      }

      if (overviewAgg.size > 0) {
        const overviewCodes = Array.from(overviewAgg.keys());
        const { data: overviewCatalogRows } = await supabase
          .from("cpv_codes")
          .select("id, descricao")
          .in("id", overviewCodes);

        const overviewDescMap = new Map<string, string>();
        for (const row of overviewCatalogRows ?? []) {
          const item = row as { id: string; descricao: string };
          overviewDescMap.set(item.id, item.descricao);
        }

        const overviewItems = Array.from(overviewAgg.entries())
          .map(([code, agg]) => ({
            code,
            description: overviewDescMap.get(code) ?? null,
            contracts: agg.contracts,
            totalValue: agg.totalValue,
            avgContractValue: agg.contracts > 0 ? agg.totalValue / agg.contracts : 0,
            avgDiscountPct: agg.discountCount > 0 ? agg.discountSum / agg.discountCount : null,
          }))
          .sort((a, b) => (b.contracts - a.contracts) || (b.totalValue - a.totalValue))
          .slice(0, 16);

        marketOverview = {
          totalContracts: overviewTotalContracts,
          totalValue: overviewTotalValue,
          activeCpvs: overviewAgg.size,
          avgDiscountPct: overviewDiscountCount > 0 ? overviewDiscountSum / overviewDiscountCount : null,
          items: overviewItems,
        };
      }
    }

    // ----- Charts aggregation (monthly, procedure, district) -----
    {
      const chartRows = await fetchAllContractsForTenant<ContractForCharts>(
        supabase,
        tenantId,
        "signing_date, contract_price, execution_locations, procedure_type",
      );

      const monthlyMap = new Map<string, { contracts: number; value: number }>();
      const procedureMap = new Map<string, { contracts: number; value: number }>();
      const districtMap = new Map<string, number>();

      for (const row of chartRows) {
        const value = row.contract_price != null && Number.isFinite(Number(row.contract_price)) ? Number(row.contract_price) : 0;

        // Monthly
        if (row.signing_date) {
          const month = row.signing_date.slice(0, 7);
          const current = monthlyMap.get(month) ?? { contracts: 0, value: 0 };
          current.contracts += 1;
          current.value += value;
          monthlyMap.set(month, current);
        }

        // Procedure type
        const proc = row.procedure_type?.trim() || "Desconhecido";
        const currentProc = procedureMap.get(proc) ?? { contracts: 0, value: 0 };
        currentProc.contracts += 1;
        currentProc.value += value;
        procedureMap.set(proc, currentProc);

        // District — execution_locations is string[]
        const locs = Array.isArray(row.execution_locations) ? (row.execution_locations as string[]) : [];
        const seenDistricts = new Set<string>();
        for (const loc of locs) {
          if (typeof loc !== "string") continue;
          const parts = loc.split(", ");
          if (parts.length < 2) continue;
          const district = parts[1].trim();
          if (!district || seenDistricts.has(district)) continue;
          seenDistricts.add(district);
          districtMap.set(district, (districtMap.get(district) ?? 0) + 1);
        }
      }

      monthlyData = Array.from(monthlyMap.entries())
        .map(([month, agg]) => ({ month, ...agg }))
        .sort((a, b) => a.month.localeCompare(b.month));

      procedureData = Array.from(procedureMap.entries())
        .map(([type, agg]) => ({ type, ...agg }))
        .sort((a, b) => b.contracts - a.contracts);

      districtData = Array.from(districtMap.entries())
        .map(([district, contracts]) => ({ district, contracts }))
        .sort((a, b) => b.contracts - a.contracts);
    }

    if (cpvFilter) {
      const { data } = await supabase
        .from("cpv_stats")
        .select("cpv_code, cpv_description, cpv_division, total_contracts, contracts_last_365d, total_value, avg_contract_value, avg_discount_pct, yoy_growth_pct, min_contract_value, median_contract_value, max_contract_value, top_entities, top_companies, computed_at")
        .eq("tenant_id", tenantId)
        .ilike("cpv_code", cpvFamilyLike || `${cpvFilter}%`)
        .order("total_contracts", { ascending: false })
        .limit(1)
        .maybeSingle();

      cpvInsight = data ?? null;
    }

    if (!cpvFilter) {
      const contractRows = (await fetchAllContractsForTenant<{ cpv_main: string | null; contract_price: number | null }>(
        supabase,
        tenantId,
        "cpv_main, contract_price",
      )).filter((row) => row.cpv_main != null);

      const cpvAgg = new Map<string, { contracts: number; totalValue: number }>();
      for (const typedRow of contractRows) {
        const code = normalizeCpvCode(typedRow.cpv_main);
        if (!code) continue;
        const current = cpvAgg.get(code) ?? { contracts: 0, totalValue: 0 };
        current.contracts += 1;
        const value = typedRow.contract_price == null ? 0 : Number(typedRow.contract_price);
        current.totalValue += Number.isFinite(value) ? value : 0;
        cpvAgg.set(code, current);
      }

      const topCodes = Array.from(cpvAgg.entries())
        .sort((a, b) => (b[1].contracts - a[1].contracts) || (b[1].totalValue - a[1].totalValue))
        .slice(0, 12);

      if (topCodes.length > 0) {
        const codes = topCodes.map(([code]) => code);
        const { data: cpvCatalogRows } = await supabase
          .from("cpv_codes")
          .select("id, descricao")
          .in("id", codes);

        const descMap = new Map<string, string>();
        for (const row of cpvCatalogRows ?? []) {
          const item = row as { id: string; descricao: string };
          descMap.set(item.id, item.descricao);
        }

        cpvCarouselItems = topCodes.map(([code, agg]) => ({
          code,
          contracts: agg.contracts,
          totalValue: agg.totalValue,
          description: descMap.get(code) ?? null,
        }));
      } else {
        const { data: cpvCatalogRows } = await supabase
          .from("cpv_codes")
          .select("id, descricao")
          .order("id", { ascending: true })
          .limit(12);

        cpvCarouselItems = (cpvCatalogRows ?? []).map((row) => {
          const item = row as { id: string; descricao: string };
          return { code: item.id, description: item.descricao, contracts: 0, totalValue: 0 };
        });
      }
    }
  }

  if (cpvFilter && !cpvInsight) {
    const { data: exactCatalogMatch } = await supabase
      .from("cpv_codes")
      .select("id, descricao")
      .eq("id", cpvFilter)
      .maybeSingle();

    cpvCatalogMatch = exactCatalogMatch ?? null;

    if (!cpvCatalogMatch && cpvFamilyLike) {
      const { data: familyCatalogMatch } = await supabase
        .from("cpv_codes")
        .select("id, descricao")
        .ilike("id", cpvFamilyLike)
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      cpvCatalogMatch = familyCatalogMatch ?? null;
    }

    if (!cpvCatalogMatch) {
      const { data: fuzzyCatalogMatch } = await supabase
        .from("cpv_codes")
        .select("id, descricao")
        .or(`id.ilike.${cpvFilter}%,descricao.ilike.%${cpvFilter}%`)
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      cpvCatalogMatch = fuzzyCatalogMatch ?? null;
    }

    if (cpvCatalogMatch && tenantId) {
      const pageSize = 1000;
      const rows: ContractForStats[] = [];
      const selectedCode = normalizeCpvInput(cpvCatalogMatch.id || cpvFilter);
      const selectedFamilyPrefixes = deriveCpvFallbackPrefixes(selectedCode);

      for (let from = 0; ; from += pageSize) {
        const { data: pageRows } = await supabase
          .from("contracts")
          .select("cpv_main, cpv_list, contract_price, base_price, signing_date, publication_date, contracting_entities, winners")
          .eq("tenant_id", tenantId)
          .range(from, from + pageSize - 1);

        const chunk = (pageRows ?? []) as ContractForStats[];
        if (chunk.length === 0) break;
        for (const row of chunk) {
          const main = normalizeCpvInput(row.cpv_main ?? "");
          const list = parseCpvArray(row.cpv_list);
          const hasExact = main === selectedCode || list.includes(selectedCode);
          const hasFamily = selectedFamilyPrefixes.some((prefix) =>
            main.startsWith(prefix) || list.some((code) => code.startsWith(prefix))
          );

          if (hasExact || hasFamily) {
            rows.push(row);
          }
        }
        if (chunk.length < pageSize) break;
      }

      if (rows.length > 0) {
        cpvInsight = computeFallbackInsight(cpvFilter, cpvCatalogMatch.descricao, rows);
        isRealtimeFallback = true;
      }
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        icon={TrendingUp}
        title="Mercado"
        description="Inteligência de mercado da contratação pública portuguesa -- análise por sector CPV, tendências, preços e oportunidades"
        meta={
          totalCpvStats > 0 ? (
            <p className="text-sm font-medium text-brand-600">
              {totalCpvStats.toLocaleString("pt-PT")} sectores CPV analisados
            </p>
          ) : undefined
        }
      />

      {/* Visão geral */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">Visão geral de mercado</h2>
        {marketOverview ? (
          <MarketOverviewPanel
            totalContracts={marketOverview.totalContracts}
            totalValue={marketOverview.totalValue}
            activeCpvs={marketOverview.activeCpvs}
            avgDiscountPct={marketOverview.avgDiscountPct}
            items={marketOverview.items}
          />
        ) : (
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-5 text-sm text-gray-500">
            Ainda não existem contratos suficientes para comparar CPVs no mercado.
          </div>
        )}
      </div>

      {/* Tendências: evolução mensal, procedimentos, distritos */}
      {(monthlyData.length > 0 || procedureData.length > 0 || districtData.length > 0) && (
        <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
          <h2 className="font-semibold text-gray-900 mb-4">Tendências e distribuição</h2>
          <MarketChartsPanel
            monthlyData={monthlyData}
            procedureData={procedureData}
            districtData={districtData}
          />
        </div>
      )}

      {/* Visão de mercado por CPV */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">Visão de mercado por CPV</h2>

        <form className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <label htmlFor="cpv" className="mb-1 block text-xs font-medium text-gray-500">
              Código CPV
            </label>
            <input
              id="cpv"
              name="cpv"
              defaultValue={cpvFilter}
              placeholder="Ex: 71240000-2"
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-card transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md"
          >
            Ver estatística
          </button>
        </form>

        {!cpvFilter && (
          <CpvCarouselHints items={cpvCarouselItems} />
        )}

        {cpvFilter && !cpvInsight && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
            {cpvCatalogMatch ? (
              <>
                O CPV <strong>{cpvFilter}</strong> existe (<strong>{cpvCatalogMatch.descricao}</strong>),
                mas ainda não tem estatísticas calculadas na tabela <strong>cpv_stats</strong> nem contratos suficientes para cálculo em tempo real.
              </>
            ) : (
              <>
                Não foi encontrado nenhum CPV com o código <strong>{cpvFilter}</strong>.
              </>
            )}
          </div>
        )}

        {cpvInsight && (
          <MarketInsightPanel
            cpvCode={cpvInsight.cpv_code}
            cpvDescription={cpvInsight.cpv_description}
            cpvDivision={cpvInsight.cpv_division}
            isRealtimeFallback={isRealtimeFallback}
            totalContracts={cpvInsight.total_contracts}
            contractsLast365d={cpvInsight.contracts_last_365d}
            totalValue={cpvInsight.total_value}
            avgContractValue={cpvInsight.avg_contract_value}
            avgDiscountPct={cpvInsight.avg_discount_pct}
            yoyGrowthPct={cpvInsight.yoy_growth_pct}
            minContractValue={cpvInsight.min_contract_value}
            medianContractValue={cpvInsight.median_contract_value}
            maxContractValue={cpvInsight.max_contract_value}
            topEntities={parseTopParties(cpvInsight.top_entities)}
            topCompanies={parseTopParties(cpvInsight.top_companies)}
            computedAt={cpvInsight.computed_at}
          />
        )}
      </div>
    </div>
  );
}
