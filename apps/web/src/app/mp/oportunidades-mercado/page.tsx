import Link from "next/link";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";
import { createAdminClient } from "@/lib/supabase/server";
import BackButton from "@/components/BackButton";
import OportunidadesResults from "@/components/OportunidadesResults";
import InfoPopover from "@/components/InfoPopover";
import MercadoCpvInput from "@/components/MercadoCpvInput";
import MercadoDateDropdown from "@/components/MercadoDateDropdown";
import MercadoMultiSelect from "@/components/MercadoMultiSelect";
import MercadoSingleSelect from "@/components/MercadoSingleSelect";
import CurrencyValueField from "@/components/CurrencyValueField";
import EntitySearchInput from "@/components/EntitySearchInput";
import { FileText, Filter, House } from "lucide-react";

export const metadata = {
  title: "Oportunidades de Mercado | Helpdesk Público",
  description:
    "Descubra diariamente novos Concursos Públicos e oportunidades na Contratação Pública. Pesquise Entidades Adjudicantes, Contratos Públicos e Adjudicatários.",
};

export const dynamic = "force-dynamic";

type OportunidadesSearchParams = {
  page?: string;
  sort?: string;
  limit?: string;
  cpv?: string;
  entity?: string;
  announcement_number?: string;
  act_type?: string | string[];
  model?: string | string[];
  procedure?: string | string[];
  contract_type?: string | string[];
  min_value?: string;
  max_value?: string;
  from_day?: string;
  from_month?: string;
  from_year?: string;
  to_day?: string;
  to_month?: string;
  to_year?: string;
  from_date?: string;
  to_date?: string;
};

type OpportunityRow = {
  id: string;
  title: string | null;
  entity_name: string | null;
  act_type: string | null;
  procedure_type: string | null;
  contract_type: string | null;
  publication_date: string | null;
  proposal_deadline_days: number | null;
  proposal_deadline_at: string | null;
  cpv_main: string | null;
  cpv_list: string[] | null;
  base_price: number | null;
  currency: string | null;
  status: string;
};

const CONTRACT_TYPE_CANONICAL = [
  "Aquisição de bens móveis",
  "Aquisição de serviços",
  "Concessão de obras públicas",
  "Concessão de serviços públicos",
  "Empreitadas de obras públicas",
  "Locação de bens móveis",
  "Sociedade",
  "Outros",
] as const;

const MODEL_TYPE_CANONICAL = [
  "Concurso público",
  "Concurso público urgente",
  "Concurso limitado por prévia qualificação",
  "Procedimento de negociação",
  "Diálogo concorrencial",
  "Concurso de conceção",
  "Anúncio simplificado",
  "Instituição de sistema de qualificação",
  "Intenção de celebração de empreitadas de obras públicas por concessionários que não sejam entidades adjudicantes",
  "Parceria para a inovação",
  "Concurso de ideias",
  "Instituição de sistema de aquisição dinâmico",
  "Hasta Pública de Alienação de Bens Móveis",
  "Aquisição de Serviços Sociais e de Outros Serviços Específicos",
  "Anúncio de Adjudicação de Aquisição de Serviços Sociais e de Outros Serviços Específicos",
  "Concurso público simplificado",
  "Concurso limitado por prévia qualificação simplificado",
] as const;

const ACT_TYPE_CANONICAL = [
  "Anúncio de procedimento",
  "Anúncio de concurso urgente",
  "Declaração de retificação de anúncio",
  "Aviso de prorrogação de prazo",
  "Anúncio de Alteração",
] as const;

const ACT_TYPE_VARIANTS: Record<string, string[]> = {
  "Anúncio de procedimento": ["Anúncio de procedimento", "Anúncio de procedimento"],
  "Anúncio de concurso urgente": ["Anúncio de concurso urgente", "Anúncio de concurso urgente"],
  "Declaração de retificação de anúncio": [
    "Declaração de retificação de anúncio",
    "Declaração de retificação de anúncio",
  ],
  "Aviso de prorrogação de prazo": ["Aviso de prorrogação de prazo", "Aviso de prorrogacao de prazo"],
  "Anúncio de Alteração": ["Anúncio de Alteração", "Anúncio de alteração", "Anuncio de Alteracao"],
};

const CONTRACT_TYPE_VARIANTS: Record<string, string[]> = {
  "Aquisição de bens móveis": ["Aquisição de bens móveis", "Aquisição de Bens Móveis"],
  "Aquisição de serviços": ["Aquisição de serviços", "Aquisição de Serviços"],
  "Concessão de obras públicas": ["Concessão de obras públicas", "Concessão de Obras Públicas"],
  "Concessão de serviços públicos": ["Concessão de serviços públicos", "Concessão de Serviços Públicos"],
  "Empreitadas de obras públicas": ["Empreitadas de obras públicas", "Empreitada de Obras Públicas"],
  "Locação de bens móveis": ["Locação de bens móveis", "Locação de Bens Móveis"],
  "Sociedade": ["Sociedade"],
  "Outros": ["Outros"],
};

const MODEL_TYPE_VARIANTS: Record<string, string[]> = {
  "Concurso público": ["Concurso público", "Concurso Publico"],
  "Concurso público urgente": ["Concurso público urgente", "Concurso Publico urgente"],
  "Concurso limitado por prévia qualificação": [
    "Concurso limitado por prévia qualificação",
    "Concurso limitado por previa qualificacao",
  ],
  "Procedimento de negociação": ["Procedimento de negociação", "Procedimento de negociacao"],
  "Diálogo concorrencial": ["Diálogo concorrencial", "Dialogo concorrencial"],
  "Concurso de conceção": ["Concurso de conceção", "Concurso de concecao"],
  "Anúncio simplificado": ["Anúncio simplificado", "Anuncio simplificado"],
  "Instituição de sistema de qualificação": ["Instituição de sistema de qualificação", "Instituicao de sistema de qualificacao"],
  "Intenção de celebração de empreitadas de obras públicas por concessionários que não sejam entidades adjudicantes": [
    "Intenção de celebração de empreitadas de obras públicas por concessionários que não sejam entidades adjudicantes",
    "Intencao de celebracao de empreitadas de obras publicas por concessionarios que nao sejam entidades adjudicantes",
  ],
  "Parceria para a inovação": ["Parceria para a inovação", "Parceria para a inovacao"],
  "Concurso de ideias": ["Concurso de ideias"],
  "Instituição de sistema de aquisição dinâmico": ["Instituição de sistema de aquisição dinâmico", "Instituicao de sistema de aquisicao dinamico"],
  "Hasta Pública de Alienação de Bens Móveis": ["Hasta Pública de Alienação de Bens Móveis", "Hasta Publica de Alienacao de Bens Moveis"],
  "Aquisição de Serviços Sociais e de Outros Serviços Específicos": [
    "Aquisição de Serviços Sociais e de Outros Serviços Específicos",
    "Aquisição de serviços sociais e de outros serviços específicos",
    "Aquisicao de Servicos Sociais e de Outros Servicos Especificos",
  ],
  "Anúncio de Adjudicação de Aquisição de Serviços Sociais e de Outros Serviços Específicos": [
    "Anúncio de Adjudicação de Aquisição de Serviços Sociais e de Outros Serviços Específicos",
    "Anuncio de Adjudicacao de Aquisicao de Servicos Sociais e de Outros Servicos Especificos",
  ],
  "Concurso público simplificado": ["Concurso público simplificado", "Concurso Publico simplificado"],
  "Concurso limitado por prévia qualificação simplificado": [
    "Concurso limitado por prévia qualificação simplificado",
    "Concurso limitado por previa qualificacao simplificado",
  ],
};

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string): string {
  return normalizeLabel(value)
    .toLocaleLowerCase("pt-PT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeContractType(value: string): string {
  const normalized = normalizeLabel(value);
  const key = normalizeKey(normalized);
  const canonical = CONTRACT_TYPE_CANONICAL.find((item) => {
    const variants = CONTRACT_TYPE_VARIANTS[item] ?? [item];
    return variants.some((variant) => normalizeKey(variant) === key);
  });
  return canonical ?? normalized;
}

function contractTypeFilterValues(value: string): string[] {
  const canonical = normalizeContractType(value);
  const variants = CONTRACT_TYPE_VARIANTS[canonical] ?? [canonical];
  return Array.from(new Set(variants));
}

function normalizeActType(value: string): string {
  const key = normalizeKey(value);
  const canonical = ACT_TYPE_CANONICAL.find((item) => {
    const variants = ACT_TYPE_VARIANTS[item] ?? [item];
    return variants.some((variant) => normalizeKey(variant) === key);
  });
  return canonical ?? normalizeLabel(value);
}

function actTypeFilterValues(value: string): string[] {
  const canonical = normalizeActType(value);
  const variants = ACT_TYPE_VARIANTS[canonical] ?? [canonical];
  return Array.from(new Set(variants));
}

function normalizeModelType(value: string): string {
  const key = normalizeKey(value);
  const canonical = MODEL_TYPE_CANONICAL.find((item) => {
    const variants = MODEL_TYPE_VARIANTS[item] ?? [item];
    return variants.some((variant) => normalizeKey(variant) === key);
  });
  return canonical ?? normalizeLabel(value);
}

function modelTypeFilterValues(value: string): string[] {
  const canonical = normalizeModelType(value);
  const variants = MODEL_TYPE_VARIANTS[canonical] ?? [canonical];
  return Array.from(new Set(variants));
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseIsoDateParts(value: string): { day: string; month: string; year: string } {
  if (!isIsoDate(value)) return { day: "", month: "", year: "" };
  const [year, month, day] = value.split("-");
  return { day, month, year };
}

function toIsoFromParts(day: string, month: string, year: string): string {
  if (!day || !month || !year) return "";
  const y = Number.parseInt(year, 10);
  const m = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return "";

  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() + 1 !== m ||
    date.getUTCDate() !== d
  ) {
    return "";
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function getArrayParam(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value])
    .flatMap((item) => item.split("|"))
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEntitySearch(value: string): string {
  return value
    .toLocaleLowerCase("pt-PT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEntitySearchTerms(value: string): string[] {
  const normalized = normalizeEntitySearch(value);
  if (!normalized) return [];

  const stopWords = new Set(["de", "do", "da", "dos", "das", "e", "a", "o"]);
  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));

  const unique = Array.from(new Set(tokens));
  if (unique.length === 0 && normalized) return [normalized];
  return unique.slice(0, 5);
}

function toIlikeToken(value: string): string {
  return value.replace(/[%,]/g, " ").trim();
}

function buildDiacriticVariants(token: string, maxVariants = 32): string[] {
  const groups: Record<string, string[]> = {
    a: ["a", "á", "à", "â", "ã"],
    e: ["e", "é", "ê"],
    i: ["i", "í"],
    o: ["o", "ó", "ô", "õ"],
    u: ["u", "ú"],
    c: ["c", "ç"],
  };

  let variants = [""];
  for (const char of token.toLocaleLowerCase("pt-PT")) {
    const choices = groups[char] ?? [char];
    const next: string[] = [];
    for (const base of variants) {
      for (const choice of choices) {
        next.push(base + choice);
        if (next.length >= maxVariants) break;
      }
      if (next.length >= maxVariants) break;
    }
    variants = next.length > 0 ? next : variants;
    if (variants.length >= maxVariants) break;
  }

  return Array.from(new Set(variants.map((variant) => variant.trim()).filter(Boolean)));
}

export default async function OportunidadesPage({
  searchParams,
}: {
  searchParams: Promise<OportunidadesSearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limitStr = (params.limit ?? "25").trim();
  const PAGE_SIZE = limitStr === "50" ? 50 : limitStr === "100" ? 100 : 25;

  const cpv = (params.cpv ?? "").trim();
  const entity = (params.entity ?? "").trim();
  const announcementNumber = (params.announcement_number ?? "").trim();
  const rawSort = (params.sort ?? "publication_date_desc").trim();
  const sort = [
    "publication_date_desc",
    "publication_date_asc",
    "value_desc",
    "value_asc",
    "deadline_asc",
  ].includes(rawSort)
    ? rawSort
    : "publication_date_desc";
  const actTypeFilters = getArrayParam(params.act_type);
  const modelTypeFilters = Array.from(
    new Set([...getArrayParam(params.model), ...getArrayParam(params.procedure)]),
  );
  const contractTypeFilters = getArrayParam(params.contract_type);
  const minValue = (params.min_value ?? "").trim();
  const maxValue = (params.max_value ?? "").trim();

  const fallbackFrom = isIsoDate(params.from_date ?? "") ? String(params.from_date) : "";
  const fallbackTo = isIsoDate(params.to_date ?? "") ? String(params.to_date) : "";

  const fallbackFromParts = parseIsoDateParts(fallbackFrom);
  const fallbackToParts = parseIsoDateParts(fallbackTo);

  const fromDay = (params.from_day ?? fallbackFromParts.day).trim();
  const fromMonth = (params.from_month ?? fallbackFromParts.month).trim();
  const fromYear = (params.from_year ?? fallbackFromParts.year).trim();
  const toDay = (params.to_day ?? fallbackToParts.day).trim();
  const toMonth = (params.to_month ?? fallbackToParts.month).trim();
  const toYear = (params.to_year ?? fallbackToParts.year).trim();

  const fromDate = toIsoFromParts(fromDay, fromMonth, fromYear);
  const toDate = toIsoFromParts(toDay, toMonth, toYear);
  const publicationFromDate = fromDate;
  const publicationToDate = toDate || (fromDate ? fromDate : "");

  const supabase = await createAdminClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();

  const tenantId = tenant?.id ?? null;

  let opportunities: OpportunityRow[] = [];
  let cpvDescriptions: Record<string, string> = {};
  let totalCount = 0;
  let entityOptions: Array<{ name: string; nif: string | null }> = [];
  const actTypeOptions = [...ACT_TYPE_CANONICAL];
  const modelTypeOptions = [...MODEL_TYPE_CANONICAL];
  const contractTypeOptions = [...CONTRACT_TYPE_CANONICAL];

  if (tenantId) {
    const { data: rawEntityOptions } = await supabase
      .from("announcements")
      .select("entity_name, entity_nif, publication_date")
      .eq("tenant_id", tenantId)
      .not("entity_name", "is", null)
      .order("publication_date", { ascending: false })
      .limit(300);

    const seenEntityKeys = new Set<string>();
    entityOptions = (rawEntityOptions ?? [])
      .map((row) => ({
        name: String((row as { entity_name?: unknown }).entity_name ?? "").trim(),
        nif: (() => {
          const digits = String((row as { entity_nif?: unknown }).entity_nif ?? "").replace(/\D/g, "");
          return digits || null;
        })(),
      }))
      .filter((row) => {
        if (!row.name) return false;
        const key = `${normalizeEntitySearch(row.name)}|${row.nif ?? ""}`;
        if (seenEntityKeys.has(key)) return false;
        seenEntityKeys.add(key);
        return true;
      })
      .slice(0, 120);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("announcements")
      .select(
        "id, title, entity_name, act_type, procedure_type, contract_type, publication_date, proposal_deadline_days, proposal_deadline_at, cpv_main, cpv_list, base_price, currency, status",
        { count: "exact" },
      )
      .eq("tenant_id", tenantId);

    // Mostrar anúncios ativos e expirados recentes. A limpeza automática remove
    // os expirados apenas depois do período de retenção.
    query = query.in("status", ["active", "expired"]);

    if (cpv) query = query.ilike("cpv_main", `${cpv}%`);
    if (entity) {
      const entityDigits = entity.replace(/\D/g, "");
      const termClauses = buildEntitySearchTerms(entity)
        .flatMap((term) => {
          const ilikeTerm = toIlikeToken(term);
          if (!ilikeTerm) return [];
          const variants = buildDiacriticVariants(ilikeTerm, 32);
          return variants.length > 0 ? variants : [ilikeTerm];
        })
        .filter(Boolean)
        .map((term) => `entity_name.ilike.%${term}%`);
      const baseEntityToken = toIlikeToken(entity);
      const baseEntityVariants = baseEntityToken ? buildDiacriticVariants(baseEntityToken, 32) : [];

      const orClauses = Array.from(
        new Set([
          ...baseEntityVariants.map((term) => `entity_name.ilike.%${term}%`),
          ...termClauses,
          ...(entityDigits.length >= 5 ? [`entity_nif.ilike.%${entityDigits}%`] : []),
        ]),
      );

      if (orClauses.length > 0) {
        query = query.or(orClauses.join(","));
      }
    }
    if (actTypeFilters.length > 0) {
      query = query.in(
        "act_type",
        Array.from(new Set(actTypeFilters.flatMap((value) => actTypeFilterValues(value)))),
      );
    }
    if (modelTypeFilters.length > 0) {
      query = query.in(
        "procedure_type",
        Array.from(new Set(modelTypeFilters.flatMap((value) => modelTypeFilterValues(value)))),
      );
    }
    if (contractTypeFilters.length > 0) {
      query = query.in(
        "contract_type",
        Array.from(new Set(contractTypeFilters.flatMap((value) => contractTypeFilterValues(value)))),
      );
    }
    if (announcementNumber) {
      query = query.or(
        `dr_announcement_no.ilike.${announcementNumber},base_announcement_id.ilike.${announcementNumber}`,
      );
    }
    if (minValue) query = query.gte("base_price", Number.parseFloat(minValue));
    if (maxValue) query = query.lte("base_price", Number.parseFloat(maxValue));
    // If only one publication date is selected, treat it as an exact-day filter.
    if (publicationFromDate) query = query.gte("publication_date", publicationFromDate);
    if (publicationToDate) query = query.lte("publication_date", publicationToDate);

    if (sort === "publication_date_asc") {
      query = query
        .order("publication_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true });
    } else if (sort === "value_desc") {
      query = query
        .order("base_price", { ascending: false, nullsFirst: false })
        .order("publication_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false });
    } else if (sort === "value_asc") {
      query = query
        .order("base_price", { ascending: true, nullsFirst: false })
        .order("publication_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false });
    } else if (sort === "deadline_asc") {
      query = query
        .order("proposal_deadline_at", { ascending: true, nullsFirst: false })
        .order("publication_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false });
    } else {
      query = query
        .order("publication_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false });
    }

    const { data, count } = await query.range(from, to);

    totalCount = count ?? 0;
    opportunities = (data ?? []) as OpportunityRow[];

    const cpvCodes = Array.from(
      new Set(
        opportunities
          .flatMap((op) => [op.cpv_main, ...(Array.isArray(op.cpv_list) ? op.cpv_list : [])])
          .filter(Boolean) as string[],
      ),
    );

    if (cpvCodes.length > 0) {
      const { data: cpvRows } = await supabase
        .from("cpv_codes")
        .select("id, descricao")
        .in("id", cpvCodes);

      cpvDescriptions = Object.fromEntries(
        (cpvRows ?? []).map((row) => [row.id, row.descricao ?? ""]),
      );
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasFilters =
    Boolean(cpv) ||
    Boolean(entity) ||
    Boolean(announcementNumber) ||
    actTypeFilters.length > 0 ||
    modelTypeFilters.length > 0 ||
    contractTypeFilters.length > 0 ||
    Boolean(minValue) ||
    Boolean(maxValue) ||
    Boolean(fromDate) ||
    Boolean(toDate);

  const filtersResetKey = [
    cpv,
    entity,
    announcementNumber,
    actTypeFilters.join("|"),
    modelTypeFilters.join("|"),
    contractTypeFilters.join("|"),
    minValue,
    maxValue,
    fromDate,
    toDate,
    String(PAGE_SIZE),
    sort,
  ].join("|");

  return (
    <div
      className="min-h-screen flex flex-col overflow-x-hidden"
      style={{ background: "rgba(248, 250, 252, 1)" }}
    >
      <Header />

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-6 space-y-6 sm:px-6 sm:py-8 lg:py-10">
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap sm:items-center">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-green-500" />
              <div>
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Oportunidades de Contratação Pública</h1>
                <p className="text-gray-500 text-sm mt-0.5">
                  {totalCount.toLocaleString("pt-PT")} anúncios encontrados
                </p>
              </div>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Link
                href="/mp"
                className="inline-flex h-10 flex-1 min-w-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 sm:w-fit sm:flex-none sm:px-4"
              >
                <House className="h-4 w-4" />
                Página inicial
              </Link>
              <BackButton fallbackHref="/" className="h-10 flex-1 min-w-0 justify-center sm:w-fit sm:flex-none" />
            </div>
          </div>

          <form key={filtersResetKey} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <MercadoCpvInput
                defaultValue={cpv}
                label="CPV"
                placeholder="CPV (ex: 331 ou 45000000)"
                infoText="Indique o código CPV que pretende pesquisar (atualização automática da página por inserção de código)"
                inputClassName="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
                debounceMs={250}
              />

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="block text-xs text-gray-400">Entidade Adjudicante</label>
                  <InfoPopover text="Indique nome ou NIPC da Entidade que pretende pesquisar" />
                </div>
                <EntitySearchInput
                  name="entity"
                  defaultValue={entity}
                  placeholder="Nome ou NIPC"
                  minChars={2}
                  options={entityOptions}
                  className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
                />
              </div>

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="block text-xs text-gray-400">Nº de Anúncio</label>
                  <InfoPopover text="Indique o nº de anúncio que consta no Diário da República." />
                </div>
                <input
                  name="announcement_number"
                  defaultValue={announcementNumber}
                  placeholder="Nº DRE"
                  className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
                />
              </div>

              <div>
                <MercadoMultiSelect
                  name="act_type"
                  label="Tipo de ato"
                  options={actTypeOptions}
                  defaultSelected={actTypeFilters}
                />
              </div>

              <div>
                <MercadoMultiSelect
                  name="contract_type"
                  label="Tipo de contrato"
                  options={contractTypeOptions}
                  defaultSelected={contractTypeFilters}
                />
              </div>

              <div>
                <MercadoMultiSelect
                  name="model"
                  label="Tipo de Procedimento"
                  options={modelTypeOptions}
                  defaultSelected={modelTypeFilters}
                />
              </div>

            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 items-stretch">
              <div className="h-full rounded-xl border border-gray-200 bg-white p-3">
                <div className="mb-2">
                  <label className="block text-xs text-gray-400">Ordenar valor por</label>
                </div>

                <div className="grid grid-cols-2 gap-1.5 w-full">
                  <CurrencyValueField
                    name="min_value"
                    label="Mínimo"
                    defaultValue={minValue}
                    placeholder="0"
                  />

                  <CurrencyValueField
                    name="max_value"
                    label="Máximo"
                    defaultValue={maxValue}
                    placeholder="10000000"
                  />
                </div>
              </div>

              <div className="h-full rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex items-center gap-1 mb-2">
                  <label className="block text-xs text-gray-400">Data de publicação</label>
                </div>
                <MercadoDateDropdown name="from_date" defaultValue={fromDate} />
              </div>

              <div className="h-full rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex items-center gap-1 mb-2">
                  <label className="block text-xs text-gray-400">Prazo de fim</label>
                </div>
                <MercadoDateDropdown name="to_date" defaultValue={toDate} />
              </div>

              <div className="h-full rounded-xl border border-gray-200 bg-white p-3">
                <MercadoSingleSelect
                  name="limit"
                  label="Apresentar"
                  defaultValue={String(PAGE_SIZE)}
                  options={[
                    { value: "25", label: "25 Anúncios" },
                    { value: "50", label: "50 Anúncios" },
                    { value: "100", label: "100 Anúncios" },
                  ]}
                />
              </div>

              <div className="h-full rounded-xl border border-gray-200 bg-white p-3">
                <MercadoSingleSelect
                  name="sort"
                  label="Ordenar Oportunidades por"
                  defaultValue={sort}
                  autoSubmitOnChange
                  options={[
                    { value: "publication_date_desc", label: "Mais recentes" },
                    { value: "publication_date_asc", label: "Mais antigos" },
                    { value: "value_desc", label: "Maior valor" },
                    { value: "value_asc", label: "Menor valor" },
                    { value: "deadline_asc", label: "Fim mais próximo" },
                  ]}
                />
              </div>

            </div>

            <div className="grid grid-cols-1 items-center gap-2 pt-1 lg:grid-cols-[1fr_auto_1fr]">
              <span aria-hidden="true" className="hidden lg:block" />

              <button
                type="submit"
                className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-xl px-5 text-sm font-semibold text-center text-white shadow-sm transition-all hover:opacity-90 lg:w-[360px]"
                style={{ background: "#39752a" }}
              >
                <Filter className="w-4 h-4" />
                Aplicar filtros selecionados
              </button>

              <div className="flex justify-center lg:justify-start">
                {hasFilters && (
                  <Link
                    href="/mp/oportunidades-mercado"
                    className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-500 transition-all hover:bg-gray-50 sm:w-auto"
                  >
                    Limpar
                  </Link>
                )}
              </div>
            </div>
          </form>

          <OportunidadesResults
            opportunities={opportunities}
            cpvDescriptions={cpvDescriptions}
            page={page}
            totalPages={totalPages}
            hasFilters={hasFilters}
            filters={{
              cpv,
              entity,
              announcement_number: announcementNumber,
              limit: String(PAGE_SIZE),
              sort,
              model: modelTypeFilters,
              procedure: modelTypeFilters,
              act_type: actTypeFilters,
              contract_type: contractTypeFilters,
              min_value: minValue,
              max_value: maxValue,
              from_day: fromDay,
              from_month: fromMonth,
              from_year: fromYear,
              to_day: toDay,
              to_month: toMonth,
              to_year: toYear,
              from_date: fromDate,
              to_date: toDate,
            }}
          />
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
