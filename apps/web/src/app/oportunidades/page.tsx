import Link from "next/link";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";
import { createAdminClient } from "@/lib/supabase/server";
import BackButton from "@/components/BackButton";
import OportunidadesResults from "@/components/OportunidadesResults";
import InfoPopover from "@/components/InfoPopover";
import MercadoCpvInput from "@/components/MercadoCpvInput";
import MercadoDateDropdown from "@/components/MercadoDateDropdown";
import MercadoSingleSelect from "@/components/MercadoSingleSelect";
import { FileText, Filter, House } from "lucide-react";

export const dynamic = "force-dynamic";

type OportunidadesSearchParams = {
  page?: string;
  sort?: string;
  limit?: string;
  cpv?: string;
  entity?: string;
  act_type?: string;
  model?: string;
  procedure?: string;
  contract_type?: string;
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
  proposal_deadline_at: string | null;
  cpv_main: string | null;
  base_price: number | null;
  currency: string | null;
  status: string;
};

type OpportunityFacetRow = {
  act_type: string | null;
  procedure_type: string | null;
  contract_type: string | null;
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
  "Anúncio de procedimento": ["Anúncio de procedimento", "Anuncio de procedimento"],
  "Anúncio de concurso urgente": ["Anúncio de concurso urgente", "Anuncio de concurso urgente"],
  "Declaração de retificação de anúncio": [
    "Declaração de retificação de anúncio",
    "Declaracao de retificacao de anuncio",
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
  const actType = (params.act_type ?? "").trim();
  const modelType = (params.model ?? params.procedure ?? "").trim();
  const contractType = (params.contract_type ?? "").trim();
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

  const supabase = await createAdminClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();

  const tenantId = tenant?.id ?? null;

  let opportunities: OpportunityRow[] = [];
  let totalCount = 0;
  let actTypeOptions: string[] = [];
  let modelTypeOptions: string[] = [];
  let contractTypeOptions: string[] = [];

  if (tenantId) {
    const { data: facetData } = await supabase
      .from("announcements")
      .select("act_type, procedure_type, contract_type")
      .eq("tenant_id", tenantId);

    const facetRows = (facetData ?? []) as OpportunityFacetRow[];
    const actTypeSet = new Set<string>();
    const contractTypeSet = new Set<string>();

    for (const row of facetRows) {
      if (row.act_type) {
        const normalizedAct = normalizeActType(row.act_type);
        if (ACT_TYPE_CANONICAL.includes(normalizedAct as (typeof ACT_TYPE_CANONICAL)[number])) {
          actTypeSet.add(normalizedAct);
        }
      }
      if (row.contract_type) {
        const normalizedContract = normalizeContractType(row.contract_type);
        if (CONTRACT_TYPE_CANONICAL.includes(normalizedContract as (typeof CONTRACT_TYPE_CANONICAL)[number])) {
          contractTypeSet.add(normalizedContract);
        }
      }
    }

    actTypeOptions = [...ACT_TYPE_CANONICAL];
    modelTypeOptions = [...MODEL_TYPE_CANONICAL];
    contractTypeOptions = [...CONTRACT_TYPE_CANONICAL];

    let query = supabase
      .from("announcements")
      .select(
        "id, title, entity_name, act_type, procedure_type, contract_type, publication_date, proposal_deadline_at, cpv_main, base_price, currency, status",
      )
      .eq("tenant_id", tenantId)
      .limit(5000);

    if (cpv) query = query.ilike("cpv_main", `${cpv}%`);
    if (entity) query = query.ilike("entity_name", `%${entity}%`);
    if (actType) {
      query = query.in("act_type", actTypeFilterValues(actType));
    }
    if (modelType) {
      query = query.in("procedure_type", modelTypeFilterValues(modelType));
    }
    if (contractType) {
      query = query.in("contract_type", contractTypeFilterValues(contractType));
    }
    if (minValue) query = query.gte("base_price", Number.parseFloat(minValue));
    if (maxValue) query = query.lte("base_price", Number.parseFloat(maxValue));
    if (fromDate) query = query.gte("publication_date", fromDate);
    if (toDate) query = query.lte("publication_date", toDate);

    if (sort === "publication_date_asc") {
      query = query.order("publication_date", { ascending: true });
    } else if (sort === "value_desc") {
      query = query.order("base_price", { ascending: false }).order("publication_date", { ascending: false });
    } else if (sort === "value_asc") {
      query = query.order("base_price", { ascending: true }).order("publication_date", { ascending: false });
    } else if (sort === "deadline_asc") {
      query = query.order("proposal_deadline_at", { ascending: true }).order("publication_date", { ascending: false });
    } else {
      query = query.order("publication_date", { ascending: false });
    }

    const { data } = await query;
    const rows = (data ?? []) as OpportunityRow[];

    totalCount = rows.length;
    opportunities = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasFilters =
    Boolean(cpv) ||
    Boolean(entity) ||
    Boolean(actType) ||
    Boolean(modelType) ||
    Boolean(contractType) ||
    Boolean(minValue) ||
    Boolean(maxValue) ||
    Boolean(fromDate) ||
    Boolean(toDate);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "rgba(248, 250, 252, 1)" }}
    >
      <Header />

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-10 space-y-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-green-500" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Oportunidades de Contratação Publica</h1>
                <p className="text-gray-500 text-sm mt-0.5">
                  {totalCount.toLocaleString("pt-PT")} anuncios encontrados
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
              >
                <House className="h-4 w-4" />
                Pagina inicial
              </Link>
              <BackButton fallbackHref="/" className="w-fit shrink-0" />
            </div>
          </div>

          <form className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <MercadoCpvInput
                defaultValue={cpv}
                label="CPV"
                placeholder="CPV (ex: 331 ou 45000000)"
                infoText="Indique o código CPV que pretende pesquisar"
                inputClassName="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
                debounceMs={250}
              />

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="block text-xs text-gray-400">Entidade adjudicante</label>
                  <InfoPopover text="Indique nome ou NIPC da Entidade que pretende pesquisar" />
                </div>
                <input
                  name="entity"
                  defaultValue={entity}
                  placeholder="Nome ou NIPC"
                  className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
                />
              </div>

              <div>
                <MercadoSingleSelect
                  name="act_type"
                  label="Tipo de ato"
                  defaultValue={actType}
                  options={[
                    { value: "", label: "Todos" },
                    ...actTypeOptions.map((option) => ({ value: option, label: option })),
                  ]}
                />
              </div>

              <div>
                <MercadoSingleSelect
                  name="contract_type"
                  label="Tipo de contrato"
                  defaultValue={contractType}
                  options={[
                    { value: "", label: "Todos" },
                    ...contractTypeOptions.map((option) => ({ value: option, label: option })),
                  ]}
                />
              </div>

              <div>
                <MercadoSingleSelect
                  name="model"
                  label="Tipo de modelo"
                  defaultValue={modelType}
                  options={[
                    { value: "", label: "Todos" },
                    ...modelTypeOptions.map((option) => ({ value: option, label: option })),
                  ]}
                />
              </div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex items-center gap-1 mb-2">
                  <label className="block text-xs text-gray-400">De Data</label>
                  <InfoPopover text="Data inicial para o tipo de data selecionado." />
                </div>
                <MercadoDateDropdown name="from_date" defaultValue={fromDate} />
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex items-center gap-1 mb-2">
                  <label className="block text-xs text-gray-400">Ate data</label>
                  <InfoPopover text="Data final para o tipo de data selecionado." />
                </div>
                <MercadoDateDropdown name="to_date" defaultValue={toDate} />
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="grid grid-cols-2 gap-1.5 w-full">
                  <div className="w-full">
                    <div className="flex items-center gap-1 mb-1">
                      <label className="block text-xs text-gray-400">Valor minimo</label>
                      <InfoPopover text="Valor mínimo do contrato em euros." />
                    </div>
                    <input
                      name="min_value"
                      type="number"
                      defaultValue={minValue}
                      placeholder="0"
                      className="h-10 border border-gray-200 rounded-lg px-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
                    />
                  </div>

                  <div className="w-full">
                    <div className="flex items-center gap-1 mb-1">
                      <label className="block text-xs text-gray-400">Valor maximo</label>
                      <InfoPopover text="Valor máximo do contrato em euros." />
                    </div>
                    <input
                      name="max_value"
                      type="number"
                      defaultValue={maxValue}
                      placeholder="10000000"
                      className="h-10 border border-gray-200 rounded-lg px-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
                    />
                  </div>
                </div>
              </div>

              <div>
                <MercadoSingleSelect
                  name="limit"
                  label="Apresentar"
                  defaultValue={String(PAGE_SIZE)}
                  options={[
                    { value: "25", label: "25 anuncios" },
                    { value: "50", label: "50 anuncios" },
                    { value: "100", label: "100 anuncios" },
                  ]}
                />
              </div>

              <div>
                <MercadoSingleSelect
                  name="sort"
                  label="Ordenar"
                  defaultValue={sort}
                  options={[
                    { value: "publication_date_desc", label: "Mais recentes" },
                    { value: "publication_date_asc", label: "Mais antigos" },
                    { value: "value_desc", label: "Maior valor" },
                    { value: "value_asc", label: "Menor valor" },
                    { value: "deadline_asc", label: "Prazo mais proximo" },
                  ]}
                />
              </div>

              <div className="flex items-end justify-end gap-2">
                {hasFilters ? (
                  <Link
                    href="/oportunidades"
                    className="inline-flex h-10 items-center justify-center text-gray-500 text-sm font-medium px-4 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-all"
                  >
                    Limpar
                  </Link>
                ) : (
                  <span
                    aria-hidden="true"
                    className="hidden md:inline-flex h-10 items-center justify-center px-4 rounded-xl border border-transparent invisible"
                  >
                    Limpar
                  </span>
                )}
                <button
                  type="submit"
                  className="inline-flex h-10 w-full md:w-auto items-center justify-center gap-1 rounded-xl px-5 text-sm font-semibold whitespace-nowrap transition-all hover:opacity-90"
                  style={{ background: "rgba(74, 222, 128, 1)", color: "#1a1a1a" }}
                >
                  <Filter className="w-4 h-4" />
                  Pesquisar
                </button>
              </div>

            </div>
          </form>

          <OportunidadesResults
            opportunities={opportunities}
            page={page}
            totalPages={totalPages}
            hasFilters={hasFilters}
            filters={{
              cpv,
              entity,
              limit: String(PAGE_SIZE),
              sort,
              act_type: actType,
              model: modelType,
              procedure: modelType,
              contract_type: contractType,
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
