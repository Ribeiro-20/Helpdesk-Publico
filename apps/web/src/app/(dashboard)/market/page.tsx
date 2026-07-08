import { createClient } from "../../../lib/supabase/server";
import { FileSignature, Megaphone, TrendingUp } from "lucide-react";
import PageHeader from "../../../components/layout/PageHeader";
import MarketInsightPanel from "../../../components/market/MarketInsightPanel";
import CpvCarouselHints from "../../../components/market/CpvCarouselHints";
import MarketChartsLoader from "../../../components/market/MarketChartsLoader";
import MarketOverviewPanel from "../../../components/market/MarketOverviewPanel";
import CpvMultiSearchInput from "../../../components/CpvMultiSearchInput";
import SingleDatePicker from "../../../components/SingleDatePicker";

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

type ContractForResults = {
  id: string;
  object: string | null;
  act_type?: string | null;
  procedure_type: string | null;
  contract_type?: string | null;
  signing_date: string | null;
  proposal_deadline_at?: string | null;
  contract_price: number | null;
  execution_locations: unknown;
  contracting_entities: unknown;
  winners: unknown;
  cpv_main: string | null;
};

type ContractForOverview = {
  cpv_main: string | null;
  contract_price: number | null;
  base_price: number | null;
};

type CpvStatsForOverview = {
  cpv_code: string;
  cpv_description: string | null;
  total_contracts: number;
  total_value: number;
  avg_contract_value: number | null;
  avg_discount_pct: number | null;
};

type RpcMarketOverviewRow = {
  cpv_code: string;
  contracts: number;
  total_value: number | null;
  avg_contract_value: number | null;
  avg_discount_pct: number | null;
};

type CpvCarouselItem = {
  code: string;
  description: string | null;
  contracts: number;
  totalValue: number;
};

type MarketOverviewData = {
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
};

type CpvInsightData = {
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
};

type MarketCacheData = {
  totalCpvStats: number;
  cpvCarouselItems: CpvCarouselItem[];
  marketOverview: MarketOverviewData | null;
  cpvCatalogMatch: { id: string; descricao: string } | null;
  isRealtimeFallback: boolean;
  cpvInsight: CpvInsightData | null;
};

const CONTRACTS_PAGE_SIZE = 5000;
const CPV_STATS_PAGE_SIZE = 5000;
const MARKET_CACHE_TTL_MS = 30_000;
const MARKET_CACHE_MAX_ENTRIES = 200;
const MARKET_PERF_LOG_ENABLED = process.env.MARKET_PERF_LOG === "true";

const ACT_TYPE_OPTIONS = [
  "Anúncio de procedimento",
  "Anúncio de concurso urgente",
  "Declaração de retificação de anúncio",
  "Aviso de prorrogação de prazo",
  "Anúncio de Alteração",
] as const;

const CONTRACT_TYPE_OPTIONS = [
  "Aquisição de bens móveis",
  "Aquisição de serviços",
  "Concessão de obras públicas",
  "Concessão de serviços públicos",
  "Empreitadas de obras públicas",
  "Locação de bens móveis",
  "Sociedade",
  "Outros",
] as const;

const MODEL_TYPE_OPTIONS = [
  "Concurso público",
  "Concurso público urgente",
  "Concurso limitado por prévia qualificação",
  "Procedimento de negociação",
  "Diálogo concorrencial",
  "Concurso de conceção",
  "Anúncio simplificado",
  "Instituição de sistema de qualificação",
  "Parceria para a inovação",
  "Concurso de ideias",
  "Instituição de sistema de aquisição dinâmico",
  "Hasta Pública de Alienação de Bens Móveis",
  "Aquisição de Serviços Sociais e de Outros Serviços Específicos",
  "Anúncio de Adjudicação de Aquisição de Serviços Sociais e de Outros Serviços Específicos",
  "Concurso público simplificado",
  "Concurso limitado por prévia qualificação simplificado",
] as const;

const marketPageCache = new Map<string, { expiresAt: number; data: MarketCacheData }>();

async function fetchAllContractsForTenant<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  columns: string,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += CONTRACTS_PAGE_SIZE) {
    const { data } = await supabase
      .from("contracts")
      .select(columns)
      .eq("tenant_id", tenantId)
      .range(from, from + CONTRACTS_PAGE_SIZE - 1);

    const chunk = (data ?? []) as T[];
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < CONTRACTS_PAGE_SIZE) break;
  }

  return rows;
}

async function fetchAllCpvStatsForTenant<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  columns: string,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += CPV_STATS_PAGE_SIZE) {
    const { data } = await supabase
      .from("cpv_stats")
      .select(columns)
      .eq("tenant_id", tenantId)
      .range(from, from + CPV_STATS_PAGE_SIZE - 1);

    const chunk = (data ?? []) as T[];
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < CPV_STATS_PAGE_SIZE) break;
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

function parseCpvFilters(input: string): string[] {
  return Array.from(new Set(
    input
      .split(/[;,\n]+/)
      .map((item) => normalizeCpvInput(item))
      .filter(Boolean),
  ));
}

function buildCpvIlikePatterns(filters: string[]): string[] {
  const patterns = new Set<string>();

  for (const raw of filters) {
    const normalized = normalizeCpvInput(raw);
    if (!normalized) continue;

    patterns.add(`${normalized}%`);

    const digits = normalized.replace(/\D/g, "");
    if (digits.length >= 8) {
      patterns.add(`${digits.slice(0, 8)}%`);
    }
  }

  return Array.from(patterns);
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

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "--";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "0";
  return new Intl.NumberFormat("pt-PT").format(Number(value));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "--";
  const date = toDateOrNull(value);
  if (!date) return "--";
  return new Intl.DateTimeFormat("pt-PT").format(date);
}

function daysRemaining(deadlineAt: string | null | undefined): number | null {
  if (!deadlineAt) return null;
  const deadline = new Date(String(deadlineAt));
  if (Number.isNaN(deadline.getTime())) return null;

  const now = new Date();
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const end = Date.UTC(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  return Math.ceil((end - start) / 86_400_000);
}

function matchesDeadlineBucket(days: number | null, bucket: string): boolean {
  if (!bucket) return true;
  if (days == null) return false;
  if (days < 0) return false;
  if (bucket === "1_5") return days >= 1 && days <= 5;
  if (bucket === "5_14") return days >= 5 && days <= 14;
  if (bucket === "15_plus") return days >= 15;
  return true;
}

function firstDistrictFromLocations(raw: unknown): string {
  if (!Array.isArray(raw)) return "--";
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const parts = item.split(", ");
    if (parts.length >= 2) {
      const district = parts[1].trim();
      if (district) return district;
    }
  }
  return "--";
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
  searchParams: Promise<{
    analysis?: string;
    apply?: string;
    cpv?: string;
    date_from?: string;
    date_to?: string;
    deadline_bucket?: string;
    act_type?: string;
    contract_type?: string;
    model_type?: string;
    year?: string;
    month?: string;
    district?: string;
    cpv_family?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const analysisParam = (params.analysis ?? "").trim().toLowerCase();
  const selectedAnalysis = analysisParam === "announcements" || analysisParam === "contracts"
    ? analysisParam
    : null;
  const hasAppliedFilters = params.apply === "1" && Boolean(selectedAnalysis);

  const cpvFilters = parseCpvFilters(params.cpv ?? "");
  const cpvFilter = cpvFilters[0] ?? "";
  const cpvFiltersRaw = cpvFilters.join(", ");
  const dateFromFilter = (params.date_from ?? "").trim();
  const dateToFilter = (params.date_to ?? "").trim();
  const deadlineBucketFilter = (params.deadline_bucket ?? "").trim();
  const actTypeFilter = (params.act_type ?? "").trim();
  const contractTypeFilter = (params.contract_type ?? "").trim();
  const modelTypeFilter = (params.model_type ?? "").trim();
  const yearFilter = (params.year ?? "").trim();
  const monthFilter = (params.month ?? "").trim();
  const districtFilter = (params.district ?? "").trim();
  const cpvFamilyFilter = (params.cpv_family ?? "").trim();
  const sortFilter = (params.sort ?? "").trim() || "relevance";

  const cpvFamilyPrefix = deriveCpvFamilyPrefix(cpvFilter);
  const cpvFamilyLike = cpvFamilyPrefix ? `${cpvFamilyPrefix}%` : "";

  const baseParams = new URLSearchParams();
  if (cpvFiltersRaw) baseParams.set("cpv", cpvFiltersRaw);
  if (dateFromFilter) baseParams.set("date_from", dateFromFilter);
  if (dateToFilter) baseParams.set("date_to", dateToFilter);
  if (deadlineBucketFilter) baseParams.set("deadline_bucket", deadlineBucketFilter);
  if (actTypeFilter) baseParams.set("act_type", actTypeFilter);
  if (contractTypeFilter) baseParams.set("contract_type", contractTypeFilter);
  if (modelTypeFilter) baseParams.set("model_type", modelTypeFilter);
  if (yearFilter) baseParams.set("year", yearFilter);
  if (monthFilter) baseParams.set("month", monthFilter);
  if (districtFilter) baseParams.set("district", districtFilter);
  if (cpvFamilyFilter) baseParams.set("cpv_family", cpvFamilyFilter);
  if (sortFilter && sortFilter !== "relevance") baseParams.set("sort", sortFilter);

  const contractsHref = (() => {
    const p = new URLSearchParams(baseParams);
    p.set("analysis", "contracts");
    p.delete("apply");
    return `/market?${p.toString()}`;
  })();

  const announcementsHref = (() => {
    const p = new URLSearchParams(baseParams);
    p.set("analysis", "announcements");
    p.delete("apply");
    return `/market?${p.toString()}`;
  })();

  const cpvCarouselQuery = (() => {
    const p = new URLSearchParams(baseParams);
    p.delete("cpv");
    p.set("analysis", selectedAnalysis ?? "contracts");
    p.set("apply", "1");
    return p.toString();
  })();

  const analysisButtons = (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-surface-200 bg-white p-4 shadow-card">
      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href={announcementsHref}
          className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border px-6 py-3 text-base font-semibold transition-all ${selectedAnalysis === "announcements"
            ? "border-brand-200 bg-brand-50 text-brand-600"
            : "border-surface-200 bg-white text-gray-700 hover:bg-brand-50 hover:text-brand-600"}`}
        >
          <Megaphone className="h-5 w-5" />
          <span>Anúncios</span>
        </a>
        <a
          href={contractsHref}
          className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border px-6 py-3 text-base font-semibold transition-all ${selectedAnalysis === "contracts"
            ? "border-brand-200 bg-brand-50 text-brand-600"
            : "border-surface-200 bg-white text-gray-700 hover:bg-brand-50 hover:text-brand-600"}`}
        >
          <FileSignature className="h-5 w-5" />
          <span>Contratos</span>
        </a>
      </div>
    </div>
  );

  const filtersForm = selectedAnalysis ? (
    <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
      <h2 className="font-semibold text-gray-900 mb-4">Filtros de mercado</h2>
      <form className="space-y-4">
        <input type="hidden" name="analysis" value={selectedAnalysis} />
        <input type="hidden" name="apply" value="1" />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-400">Tipo de ato</span>
            <select
              name="act_type"
              defaultValue={actTypeFilter}
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-card transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">Todos</option>
              {ACT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-gray-400">Tipo de contrato</span>
            <select
              name="contract_type"
              defaultValue={contractTypeFilter}
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-card transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">Todos</option>
              {CONTRACT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-gray-400">Tipo de modelo</span>
            <select
              name="model_type"
              defaultValue={modelTypeFilter}
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-card transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">Todos</option>
              {MODEL_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-gray-400">Prazo de resposta</span>
            <select
              name="deadline_bucket"
              defaultValue={deadlineBucketFilter}
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-card transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">Todos</option>
              <option value="1_5">1-5 dias</option>
              <option value="5_14">5-14 dias</option>
              <option value="15_plus">15+ dias</option>
            </select>
          </label>

          <div className="block">
            <span className="mb-1 block text-xs text-gray-400">Data inicial</span>
            <SingleDatePicker
              name="date_from"
              defaultValue={dateFromFilter}
              placeholder="Selecionar data"
              className="w-full"
              buttonClassName="w-full justify-start"
            />
          </div>

          <div className="block">
            <span className="mb-1 block text-xs text-gray-400">Data final</span>
            <SingleDatePicker
              name="date_to"
              defaultValue={dateToFilter}
              min={dateFromFilter || undefined}
              placeholder="Selecionar data"
              className="w-full"
              buttonClassName="w-full justify-start"
            />
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-gray-400">Distrito</span>
            <input
              name="district"
              defaultValue={districtFilter}
              placeholder="Ex: Lisboa"
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-card transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-gray-400">Família de Serviço</span>
            <input
              name="cpv_family"
              defaultValue={cpvFamilyFilter}
              placeholder="Ex: 71"
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-card transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </label>

          <div>
            <CpvMultiSearchInput
              name="cpv"
              defaultValue={cpvFiltersRaw}
              label="CPV"
              placeholder="Ex: 71240000-2"
              compact
            />
          </div>

          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block text-xs text-gray-400">Ordenação</span>
            <select
              name="sort"
              defaultValue={sortFilter}
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-card transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="relevance">Mais relevantes</option>
              <option value="recent">Mais recentes</option>
              <option value="value_desc">Maior valor</option>
              <option value="value_asc">Menor valor</option>
            </select>
          </label>
        </div>

        <div>
          <button
            type="submit"
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md"
          >
            Filtrar
          </button>
        </div>
      </form>
    </div>
  ) : null;

  if (!hasAppliedFilters) {
    return (
      <div className="space-y-8">
        <PageHeader
          icon={TrendingUp}
          title="Mercado"
          description="Inteligência de mercado da contratação pública portuguesa -- análise por sector CPV, tendências, preços e oportunidades"
        />

        {analysisButtons}

        {filtersForm}
      </div>
    );
  }

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
  const requestStart = performance.now();
  const perf: Record<string, number> = {};

  let cachedData: MarketCacheData | null = null;
  let cacheKey: string | null = null;

  if (tenantId) {
    cacheKey = `${tenantId}::${cpvFilter || "__overview__"}`;
    const cacheEntry = marketPageCache.get(cacheKey);
    if (cacheEntry) {
      if (cacheEntry.expiresAt > Date.now()) {
        cachedData = cacheEntry.data;
        perf.cache_hit = 1;
      } else {
        marketPageCache.delete(cacheKey);
      }
    }
  }

  let totalCpvStats = 0;
  let cpvCarouselItems: CpvCarouselItem[] = [];
  let marketOverview: MarketOverviewData | null = null;
  let cpvCatalogMatch: { id: string; descricao: string } | null = null;
  let isRealtimeFallback = false;
  let cpvInsight: CpvInsightData | null = null;
  let cpvCatalogRelated: Array<{ id: string; descricao: string }> = [];
  let cpvCatalogFamilyCount: number | null = null;
  let resultRows: ContractForResults[] = [];

  if (cachedData) {
    totalCpvStats = cachedData.totalCpvStats;
    cpvCarouselItems = cachedData.cpvCarouselItems;
    marketOverview = cachedData.marketOverview;
    cpvCatalogMatch = cachedData.cpvCatalogMatch;
    isRealtimeFallback = cachedData.isRealtimeFallback;
    cpvInsight = cachedData.cpvInsight;
  }

  if (tenantId && !cachedData) {
    const computeStart = performance.now();
    const totalCpvStatsPromise = supabase
      .from("cpv_stats")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    const cpvStatsOverviewPromise = fetchAllCpvStatsForTenant<CpvStatsForOverview>(
      supabase,
      tenantId,
      "cpv_code, cpv_description, total_contracts, total_value, avg_contract_value, avg_discount_pct",
    );

    const [totalCpvStatsResult, cpvStatsOverviewRows] = await Promise.all([
      totalCpvStatsPromise,
      cpvStatsOverviewPromise,
    ]);
    perf.base_queries_ms = Number((performance.now() - computeStart).toFixed(2));

    totalCpvStats = totalCpvStatsResult.count ?? 0;

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
      const { data: overviewRpcRows } = await supabase.rpc("market_overview_by_cpv", {
        p_tenant_id: tenantId,
      });

      const rows = (overviewRpcRows ?? []) as RpcMarketOverviewRow[];

      if (rows.length > 0) {
        const overviewTotalContracts = rows.reduce((sum, row) => sum + Number(row.contracts ?? 0), 0);
        const overviewTotalValue = rows.reduce((sum, row) => sum + Number(row.total_value ?? 0), 0);
        const discountRows = rows.filter((row) => row.avg_discount_pct != null);
        const overviewAvgDiscount = discountRows.length > 0
          ? discountRows.reduce((sum, row) => sum + Number(row.avg_discount_pct ?? 0), 0) / discountRows.length
          : null;

        const topRows = rows.slice(0, 16);
        const { data: overviewCatalogRows } = await supabase
          .from("cpv_codes")
          .select("id, descricao")
          .in("id", topRows.map((row) => row.cpv_code));

        const overviewDescMap = new Map<string, string>();
        for (const row of overviewCatalogRows ?? []) {
          const item = row as { id: string; descricao: string };
          overviewDescMap.set(item.id, item.descricao);
        }

        marketOverview = {
          totalContracts: overviewTotalContracts,
          totalValue: overviewTotalValue,
          activeCpvs: rows.length,
          avgDiscountPct: overviewAvgDiscount,
          items: topRows.map((row) => ({
            code: row.cpv_code,
            description: overviewDescMap.get(row.cpv_code) ?? null,
            contracts: Number(row.contracts ?? 0),
            totalValue: Number(row.total_value ?? 0),
            avgContractValue: Number(row.avg_contract_value ?? 0),
            avgDiscountPct: row.avg_discount_pct == null ? null : Number(row.avg_discount_pct),
          })),
        };
      }
    }

    if (cpvFilter && selectedAnalysis === "contracts") {
      const { data } = await supabase
        .from("cpv_stats")
        .select("cpv_code, cpv_description, cpv_division, total_contracts, contracts_last_365d, total_value, avg_contract_value, avg_discount_pct, yoy_growth_pct, min_contract_value, median_contract_value, max_contract_value, top_entities, top_companies, computed_at")
        .eq("tenant_id", tenantId)
        .like("cpv_code", cpvFamilyLike || `${cpvFilter}%`)
        .order("total_contracts", { ascending: false })
        .limit(1)
        .maybeSingle();

      cpvInsight = data ?? null;
    }

    if (!cpvFilter) {
      const topCodes = cpvStatsOverviewRows
        .map((row) => ({
          code: row.cpv_code,
          description: row.cpv_description,
          contracts: Number(row.total_contracts ?? 0),
          totalValue: Number(row.total_value ?? 0),
        }))
        .sort((a, b) => (b.contracts - a.contracts) || (b.totalValue - a.totalValue))
        .slice(0, 12);

      if (topCodes.length > 0) {
        const codes = topCodes.map((item) => item.code);
        const { data: cpvCatalogRows } = await supabase
          .from("cpv_codes")
          .select("id, descricao")
          .in("id", codes);

        const descMap = new Map<string, string>();
        for (const row of cpvCatalogRows ?? []) {
          const item = row as { id: string; descricao: string };
          descMap.set(item.id, item.descricao);
        }

        cpvCarouselItems = topCodes.map((item) => ({
          code: item.code,
          contracts: item.contracts,
          totalValue: item.totalValue,
          description: descMap.get(item.code) ?? item.description,
        }));
      } else if (marketOverview?.items && marketOverview.items.length > 0) {
        // Fallback: use real-time computed data from marketOverview when cpv_stats is empty.
        cpvCarouselItems = marketOverview.items.slice(0, 12).map((item) => ({
          code: item.code,
          contracts: item.contracts,
          totalValue: item.totalValue,
          description: item.description,
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

    if (cacheKey) {
      if (marketPageCache.size >= MARKET_CACHE_MAX_ENTRIES) {
        const oldestKey = marketPageCache.keys().next().value;
        if (oldestKey) marketPageCache.delete(oldestKey);
      }

      marketPageCache.set(cacheKey, {
        expiresAt: Date.now() + MARKET_CACHE_TTL_MS,
        data: {
          totalCpvStats,
          cpvCarouselItems,
          marketOverview,
          cpvCatalogMatch,
          isRealtimeFallback,
          cpvInsight,
        },
      });
    }
  }

  if (cpvFilter && selectedAnalysis === "contracts" && !cpvInsight) {
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
        .like("id", cpvFamilyLike)
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

  if (cpvFilter && selectedAnalysis === "contracts" && cpvCatalogMatch) {
    const familyPrefix = deriveCpvFamilyPrefix(cpvCatalogMatch.id || cpvFilter);
    const familyLike = familyPrefix ? `${familyPrefix}%` : "";

    if (familyLike) {
      const [familyCountResult, relatedRowsResult, familyStatsResult] = await Promise.all([
        supabase
          .from("cpv_codes")
          .select("*", { count: "exact", head: true })
          .like("id", familyLike),
        supabase
          .from("cpv_codes")
          .select("id, descricao")
          .like("id", familyLike)
          .order("id", { ascending: true })
          .limit(12),
        tenantId
          ? supabase
            .from("cpv_stats")
            .select("cpv_code, total_contracts, total_value")
            .eq("tenant_id", tenantId)
            .like("cpv_code", familyLike)
            .order("total_contracts", { ascending: false })
            .limit(24)
          : Promise.resolve({ data: [] as Array<{ cpv_code: string; total_contracts: number; total_value: number }> }),
      ]);

      cpvCatalogFamilyCount = familyCountResult.count ?? 0;
      cpvCatalogRelated = (relatedRowsResult.data ?? []) as Array<{ id: string; descricao: string }>;

      const statsMap = new Map<string, { contracts: number; totalValue: number }>();
      for (const row of (familyStatsResult.data ?? [])) {
        const item = row as { cpv_code: string; total_contracts: number; total_value: number };
        statsMap.set(item.cpv_code, {
          contracts: Number(item.total_contracts ?? 0),
          totalValue: Number(item.total_value ?? 0),
        });
      }

      if (cpvCatalogRelated.length > 0) {
        cpvCarouselItems = cpvCatalogRelated.map((item) => {
          const stats = statsMap.get(item.id);
          return {
            code: item.id,
            description: item.descricao,
            contracts: stats?.contracts ?? 0,
            totalValue: stats?.totalValue ?? 0,
          };
        });
      }
    }
  }

  if (cpvFilter && selectedAnalysis === "contracts" && tenantId && cpvCarouselItems.length > 0) {
    const needsRealtimeFamilyStats = cpvCarouselItems.every(
      (item) => item.contracts <= 0 && item.totalValue <= 0,
    );

    if (needsRealtimeFamilyStats) {
      const targetCodes = new Set(cpvCarouselItems.map((item) => normalizeCpvInput(item.code)));
      const agg = new Map<string, { contracts: number; totalValue: number }>();
      for (const code of targetCodes) {
        agg.set(code, { contracts: 0, totalValue: 0 });
      }

      const contractRows = await fetchAllContractsForTenant<Pick<ContractForStats, "cpv_main" | "cpv_list" | "contract_price">>(
        supabase,
        tenantId,
        "cpv_main, cpv_list, contract_price",
      );

      for (const row of contractRows) {
        const main = normalizeCpvInput(row.cpv_main ?? "");
        const list = parseCpvArray(row.cpv_list);
        const value = row.contract_price == null ? 0 : Number(row.contract_price);
        const valueToAdd = Number.isFinite(value) && value > 0 ? value : 0;

        const presentCodes = new Set<string>();
        if (main) presentCodes.add(main);
        for (const code of list) {
          if (code) presentCodes.add(code);
        }

        for (const code of presentCodes) {
          if (!targetCodes.has(code)) continue;
          const current = agg.get(code);
          if (!current) continue;
          current.contracts += 1;
          current.totalValue += valueToAdd;
          agg.set(code, current);
        }
      }

      cpvCarouselItems = cpvCarouselItems.map((item) => {
        const fallback = agg.get(normalizeCpvInput(item.code));
        if (!fallback) return item;
        return {
          ...item,
          contracts: fallback.contracts,
          totalValue: fallback.totalValue,
        };
      });
    }
  }

  if (cpvFilter && selectedAnalysis === "contracts" && !cpvInsight && cpvCatalogMatch) {
    const familyContracts = cpvCarouselItems.reduce((sum, item) => sum + Math.max(0, item.contracts), 0);
    const familyValue = cpvCarouselItems.reduce((sum, item) => sum + Math.max(0, item.totalValue), 0);

    if (familyContracts > 0 || familyValue > 0) {
      const avgContractValue = familyContracts > 0 ? familyValue / familyContracts : null;
      cpvInsight = {
        cpv_code: cpvCatalogMatch.id,
        cpv_description: cpvCatalogMatch.descricao,
        cpv_division: deriveCpvFamilyPrefix(cpvCatalogMatch.id).slice(0, 2) || null,
        total_contracts: familyContracts,
        contracts_last_365d: familyContracts,
        total_value: familyValue,
        avg_contract_value: avgContractValue,
        avg_discount_pct: null,
        yoy_growth_pct: null,
        min_contract_value: null,
        median_contract_value: null,
        max_contract_value: null,
        top_entities: [],
        top_companies: [],
        computed_at: new Date().toISOString(),
      };
      isRealtimeFallback = true;
    }
  }

  if (tenantId) {
    const now = new Date();
    const selectedYear = Number(yearFilter || 0);
    const validYear = Number.isFinite(selectedYear) && selectedYear >= 2000 ? selectedYear : null;
    const monthNum = Number(monthFilter || 0);
    const validMonth = Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthNum : null;

    let dateStart: string | null = dateFromFilter || null;
    let dateEnd: string | null = dateToFilter || null;

    // Backward compatibility for old links using year/month.
    if (!dateStart && !dateEnd) {
      if (validYear && validMonth) {
        const start = new Date(Date.UTC(validYear, validMonth - 1, 1));
        const end = new Date(Date.UTC(validYear, validMonth, 1));
        dateStart = start.toISOString().slice(0, 10);
        dateEnd = end.toISOString().slice(0, 10);
      } else if (validYear) {
        const start = new Date(Date.UTC(validYear, 0, 1));
        const end = new Date(Date.UTC(validYear + 1, 0, 1));
        dateStart = start.toISOString().slice(0, 10);
        dateEnd = end.toISOString().slice(0, 10);
      } else if (validMonth) {
        const start = new Date(Date.UTC(now.getUTCFullYear(), validMonth - 1, 1));
        const end = new Date(Date.UTC(now.getUTCFullYear(), validMonth, 1));
        dateStart = start.toISOString().slice(0, 10);
        dateEnd = end.toISOString().slice(0, 10);
      }
    }

    // Make end date inclusive for the selected day.
    if (dateEnd) {
      const endDate = new Date(`${dateEnd}T00:00:00Z`);
      if (!Number.isNaN(endDate.getTime())) {
        endDate.setUTCDate(endDate.getUTCDate() + 1);
        dateEnd = endDate.toISOString().slice(0, 10);
      }
    }

    if (selectedAnalysis === "announcements") {
      let announcementsQuery = supabase
        .from("announcements")
        .select("id, title, act_type, procedure_type, contract_type, publication_date, proposal_deadline_at, base_price, entity_name, cpv_main")
        .eq("tenant_id", tenantId)
        .order("publication_date", { ascending: false })
        .limit(400);

      if (cpvFilters.length > 0) {
        const cpvPatterns = buildCpvIlikePatterns(cpvFilters);
        if (cpvPatterns.length > 0) {
          announcementsQuery = announcementsQuery.or(
            cpvPatterns.map((pattern) => `cpv_main.ilike.${pattern}`).join(","),
          );
        }
      }
      if (actTypeFilter) {
        announcementsQuery = announcementsQuery.ilike("act_type", `%${actTypeFilter}%`);
      }
      if (contractTypeFilter) {
        announcementsQuery = announcementsQuery.ilike("contract_type", `%${contractTypeFilter}%`);
      }
      if (modelTypeFilter) {
        announcementsQuery = announcementsQuery.ilike("procedure_type", `%${modelTypeFilter}%`);
      }
      if (dateStart) {
        announcementsQuery = announcementsQuery.gte("publication_date", dateStart);
      }
      if (dateEnd) {
        announcementsQuery = announcementsQuery.lt("publication_date", dateEnd);
      }

      const { data: rawAnnouncements } = await announcementsQuery;
      const mappedRows = (rawAnnouncements ?? []).map((row) => {
        const ann = row as {
          id: string;
          title: string | null;
          act_type: string | null;
          procedure_type: string | null;
          contract_type: string | null;
          publication_date: string | null;
          proposal_deadline_at: string | null;
          base_price: number | null;
          entity_name: string | null;
          cpv_main: string | null;
        };

        return {
          id: ann.id,
          object: ann.title,
          act_type: ann.act_type,
          procedure_type: ann.procedure_type,
          contract_type: ann.contract_type,
          signing_date: ann.publication_date,
          proposal_deadline_at: ann.proposal_deadline_at,
          contract_price: ann.base_price,
          execution_locations: [],
          contracting_entities: ann.entity_name ? [{ name: ann.entity_name }] : [],
          winners: [],
          cpv_main: ann.cpv_main,
        } as ContractForResults;
      });

      resultRows = mappedRows.filter((row) =>
        matchesDeadlineBucket(daysRemaining(row.proposal_deadline_at ?? null), deadlineBucketFilter),
      );
    } else {
      let resultsQuery = supabase
        .from("contracts")
        .select("id, object, procedure_type, contract_type, signing_date, proposal_deadline_at, contract_price, execution_locations, contracting_entities, winners, cpv_main")
        .eq("tenant_id", tenantId)
        .order("signing_date", { ascending: false })
        .limit(200);

      if (cpvFilters.length > 0) {
        const cpvPatterns = buildCpvIlikePatterns(cpvFilters);
        if (cpvPatterns.length > 0) {
          resultsQuery = resultsQuery.or(
            cpvPatterns.map((pattern) => `cpv_main.ilike.${pattern}`).join(","),
          );
        }
      }
      if (contractTypeFilter) {
        resultsQuery = resultsQuery.ilike("contract_type", `%${contractTypeFilter}%`);
      }
      if (modelTypeFilter) {
        resultsQuery = resultsQuery.ilike("procedure_type", `%${modelTypeFilter}%`);
      }
      if (dateStart) {
        resultsQuery = resultsQuery.gte("signing_date", dateStart);
      }
      if (dateEnd) {
        resultsQuery = resultsQuery.lt("signing_date", dateEnd);
      }

      const { data: rawResultRows } = await resultsQuery;
      const rows = (rawResultRows ?? []) as ContractForResults[];
      const districtFilteredRows = districtFilter
        ? rows.filter((row) => firstDistrictFromLocations(row.execution_locations).toLowerCase().includes(districtFilter.toLowerCase()))
        : rows;

      resultRows = districtFilteredRows.filter((row) =>
        matchesDeadlineBucket(daysRemaining(row.proposal_deadline_at ?? null), deadlineBucketFilter),
      );
    }

    if (sortFilter === "value_desc") {
      resultRows.sort((a, b) => Number(b.contract_price ?? 0) - Number(a.contract_price ?? 0));
    } else if (sortFilter === "value_asc") {
      resultRows.sort((a, b) => Number(a.contract_price ?? 0) - Number(b.contract_price ?? 0));
    } else if (sortFilter === "recent") {
      resultRows.sort((a, b) => String(b.signing_date ?? "").localeCompare(String(a.signing_date ?? "")));
    }
  }

  perf.total_ms = Number((performance.now() - requestStart).toFixed(2));
  if (MARKET_PERF_LOG_ENABLED) {
    console.info("[market][server]", {
      tenantId,
      analysis: selectedAnalysis,
      dateFrom: dateFromFilter || null,
      dateTo: dateToFilter || null,
      deadlineBucket: deadlineBucketFilter || null,
      actType: actTypeFilter || null,
      contractType: contractTypeFilter || null,
      modelType: modelTypeFilter || null,
      year: yearFilter || null,
      month: monthFilter || null,
      district: districtFilter || null,
      cpvFamily: cpvFamilyFilter || null,
      sort: sortFilter || null,
      cpvFilter: cpvFilter || null,
      ...perf,
    });
  }

  const totalResults = cpvFilters.length > 1
    ? resultRows.length
    : cpvFilter
      ? (selectedAnalysis === "contracts"
        ? (cpvInsight?.total_contracts ?? cpvCarouselItems.reduce((sum, item) => sum + Math.max(0, item.contracts), 0))
        : resultRows.length)
    : (selectedAnalysis === "announcements" ? resultRows.length : (marketOverview?.totalContracts ?? 0));
  const resultLabel = selectedAnalysis === "announcements" ? "anúncios" : "contratos";
  const hasOverviewData = Boolean(marketOverview && marketOverview.totalContracts > 0);
  const kpiContracts = cpvInsight?.total_contracts ?? (resultRows.length > 0 ? resultRows.length : marketOverview?.totalContracts ?? 0);
  const kpiTotalValue = cpvInsight?.total_value ?? (resultRows.length > 0
    ? resultRows.reduce((sum, row) => sum + Math.max(0, Number(row.contract_price ?? 0)), 0)
    : marketOverview?.totalValue ?? 0);
  const kpiAvgValue = kpiContracts > 0 ? kpiTotalValue / kpiContracts : 0;
  const kpiDiscount = cpvInsight?.avg_discount_pct ?? marketOverview?.avgDiscountPct ?? null;

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

      {analysisButtons}

      {filtersForm}

      <p className="text-sm font-medium text-gray-700">
        Foram encontrados {totalResults.toLocaleString("pt-PT")} {resultLabel}.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wider text-gray-500">Valor total</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900">{formatCurrency(kpiTotalValue)}</p>
        </div>
        <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wider text-gray-500">Nº contratos</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900">{formatCount(kpiContracts)}</p>
        </div>
        <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wider text-gray-500">Valor médio</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900">{formatCurrency(kpiAvgValue)}</p>
        </div>
        <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wider text-gray-500">Desconto médio</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900">{kpiDiscount == null ? "--" : `${kpiDiscount.toFixed(1)}%`}</p>
        </div>
      </div>

      {selectedAnalysis === "contracts" && cpvFilter && cpvFilters.length === 1 && (
        <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
          <h2 className="font-semibold text-gray-900 mb-4">Visão de mercado por CPV</h2>

          {cpvCatalogMatch && !cpvInsight && (
            <div className="mb-4 rounded-xl border border-surface-200 bg-surface-50 p-4 text-sm text-gray-700">
              <p>
                <strong>{cpvCatalogMatch.id}</strong> -- {cpvCatalogMatch.descricao}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Família CPV: <strong>{deriveCpvFamilyPrefix(cpvCatalogMatch.id)}</strong>
                {cpvCatalogFamilyCount != null ? ` · ${cpvCatalogFamilyCount} códigos relacionados` : ""}
              </p>
            </div>
          )}

          {!cpvInsight && cpvCarouselItems.length > 0 && (
            <div className="mb-4">
              <CpvCarouselHints items={cpvCarouselItems} linkQuery={cpvCarouselQuery} />
            </div>
          )}

          {cpvFilter && !cpvInsight && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
              {cpvCatalogMatch ? (
                <>
                  O CPV <strong>{cpvFilter}</strong> existe (<strong>{cpvCatalogMatch.descricao}</strong>),
                  mas não foram encontrados contratos suficientes para calcular indicadores para este filtro.
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
      )}

      {hasOverviewData && (
        <>
          {/* Visão geral */}
          <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
            <h2 className="font-semibold text-gray-900 mb-4">Visão geral de mercado</h2>
            <MarketOverviewPanel
              totalContracts={marketOverview!.totalContracts}
              totalValue={marketOverview!.totalValue}
              activeCpvs={marketOverview!.activeCpvs}
              avgDiscountPct={marketOverview!.avgDiscountPct}
              items={marketOverview!.items}
            />
          </div>

          {/* Tendências: evolução mensal, procedimentos, distritos */}
          <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
            <h2 className="font-semibold text-gray-900 mb-4">Tendências e distribuição</h2>
            <MarketChartsLoader />
          </div>
        </>
      )}

      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
        <h2 className="font-semibold text-gray-900 mb-4">Tabela de Resultados</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-surface-200 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Objeto</th>
                <th className="px-3 py-2 text-left">Entidade</th>
                <th className="px-3 py-2 text-left">Empresa</th>
                <th className="px-3 py-2 text-left">Valor</th>
                <th className="px-3 py-2 text-left">Procedimento</th>
                <th className="px-3 py-2 text-left">Data</th>
                <th className="px-3 py-2 text-left">Distrito</th>
              </tr>
            </thead>
            <tbody>
              {resultRows.slice(0, 30).map((row) => {
                const entity = toPartyArray(row.contracting_entities)[0]?.name ?? "--";
                const winner = toPartyArray(row.winners)[0]?.name ?? "--";
                return (
                  <tr key={row.id} className="border-b border-surface-100">
                    <td className="px-3 py-2 text-gray-900">{row.object ?? "Sem objeto"}</td>
                    <td className="px-3 py-2 text-gray-700">{entity}</td>
                    <td className="px-3 py-2 text-gray-700">{winner}</td>
                    <td className="px-3 py-2 text-gray-900">{formatCurrency(row.contract_price)}</td>
                    <td className="px-3 py-2 text-gray-700">{row.procedure_type ?? "--"}</td>
                    <td className="px-3 py-2 text-gray-700">{formatDate(row.signing_date)}</td>
                    <td className="px-3 py-2 text-gray-700">{firstDistrictFromLocations(row.execution_locations)}</td>
                  </tr>
                );
              })}
              {resultRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-gray-500">
                    Sem resultados para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
