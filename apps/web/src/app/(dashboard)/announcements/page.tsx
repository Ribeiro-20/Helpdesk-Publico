import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/layout/PageHeader";
import CpvMultiSearchInput from "@/components/CpvMultiSearchInput";
import MercadoDateDropdown from "@/components/MercadoDateDropdown";
import MercadoMultiSelect from "@/components/MercadoMultiSelect";
import MercadoSingleSelect from "@/components/MercadoSingleSelect";
import CurrencyValueField from "@/components/CurrencyValueField";
import EntitySearchInput from "@/components/EntitySearchInput";
import Link from "next/link";
import { Megaphone, ArrowUp, ArrowDown, ArrowUpDown, FileSpreadsheet, Filter } from "lucide-react";
import { cleanAnnouncementText, effectiveStatus, STATUS_BADGE, STATUS_LABEL } from "@/lib/announcements";

const DEFAULT_PAGE_SIZE = 25;

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

const SORTABLE_CONFIG: Record<string, { col: string; dir: "asc" | "desc" }> = {
  "publication_date_desc": { col: "publication_date", dir: "desc" },
  "publication_date_asc": { col: "publication_date", dir: "asc" },
  "base_price_desc": { col: "base_price", dir: "desc" },
  "base_price_asc": { col: "base_price", dir: "asc" },
  "proposal_deadline_at_asc": { col: "proposal_deadline_at", dir: "asc" },
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function cpvCore8(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : "";
}

function parseMultiCpvFilter(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[;,\n]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function getArrayParam(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [value])
        .flatMap((item) => item.split("|"))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
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

function buildEntityNameClause(value: string): string | null {
  const baseEntityToken = toIlikeToken(value);
  const searchTerms = buildEntitySearchTerms(value)
    .map((term) => toIlikeToken(term))
    .filter(Boolean);

  if (!baseEntityToken && searchTerms.length === 0) return null;

  if (searchTerms.length <= 1) {
    const broadToken = searchTerms[0] ?? baseEntityToken;
    const variants = buildDiacriticVariants(broadToken, 32);
    const clauses = Array.from(new Set(
      (variants.length > 0 ? variants : [broadToken]).map((term) => `entity_name.ilike.%${term}%`),
    ));
    return clauses.length === 1 ? clauses[0] : `or(${clauses.join(",")})`;
  }

  const groups = searchTerms.map((term) => {
    const variants = buildDiacriticVariants(term, 32);
    const clauses = Array.from(new Set(
      (variants.length > 0 ? variants : [term]).map((variant) => `entity_name.ilike.%${variant}%`),
    ));
    return clauses.length === 1 ? clauses[0] : `or(${clauses.join(",")})`;
  });

  return groups.length === 1 ? groups[0] : `and(${groups.join(",")})`;
}

function buildCpvFilterClause(values: string[]): string {
  const clauses = values.flatMap((value) => {
    const filterCore8 = cpvCore8(value);
    if (filterCore8 && filterCore8 !== value.replace(/\s+/g, "")) {
      return [`cpv_main.ilike.%${value}%`, `cpv_main.ilike.%${filterCore8}%`];
    }
    return [`cpv_main.ilike.%${value}%`];
  });

  return Array.from(new Set(clauses)).join(",");
}

function normalizeCpvCode(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!value || value === "-" || value === "—") return null;

  const embedded = value.match(/\b\d{8}(?:-\d)?\b/);
  if (embedded) return embedded[0];

  const digits = value.replace(/\D/g, "");
  if (digits.length === 9) return `${digits.slice(0, 8)}-${digits[8]}`;
  if (digits.length === 8) return digits;
  return null;
}

function SortTh({
  label,
  col,
  current,
  dir,
  href,
  align = "left",
}: {
  label: string;
  col: string;
  current: string;
  dir: string;
  href: (overrides: Record<string, string>) => string;
  align?: "left" | "right" | "center";
}) {
  const isActive = current === col;
  const nextDir = isActive && dir === "asc" ? "desc" : "asc";
  const Icon = isActive ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th className={`px-4 py-3 text-${align}`}>
      <Link
        href={href({ sort: col, dir: nextDir, page: "1" })}
        className={`inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider transition-colors ${
          isActive ? "text-brand-600" : "text-gray-400 hover:text-gray-600"
        }`}
      >
        {label}
        <Icon className={`h-3 w-3 shrink-0 ${isActive ? "text-brand-600" : "text-gray-300"}`} />
      </Link>
    </th>
  );
}

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    cpv?: string;
    entity?: string;
    announcement_number?: string;
    act_type?: string | string[];
    procedure_type?: string | string[];
    contract_type?: string | string[];
    min_value?: string;
    max_value?: string;
    from_date?: string;
    to_date?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  // Keep filter parsing in sync with URL params for server-side rendering.
  const pageRaw = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limitRaw = Number.parseInt(params.limit ?? String(DEFAULT_PAGE_SIZE), 10);
  const PAGE_SIZE = limitRaw === 50 || limitRaw === 100 ? limitRaw : DEFAULT_PAGE_SIZE;
  const cpvFilter = params.cpv ?? "";
  const cpvFilters = parseMultiCpvFilter(cpvFilter);
  const entityFilter = params.entity ?? "";
  const entityNifFilter = entityFilter.replace(/\D/g, "");
  const announcementNumberFilter = params.announcement_number ?? "";
  const actTypeFilters = getArrayParam(params.act_type);
  const procedureTypeFilters = getArrayParam(params.procedure_type);
  const contractTypeFilters = getArrayParam(params.contract_type);
  const minValueFilter = (params.min_value ?? "").trim();
  const maxValueFilter = (params.max_value ?? "").trim();
  const minValue = minValueFilter ? Number.parseFloat(minValueFilter) : Number.NaN;
  const maxValue = maxValueFilter ? Number.parseFloat(maxValueFilter) : Number.NaN;
  const fromDateRaw = params.from_date ?? "";
  const toDateRaw = params.to_date ?? "";
  const fromDateFilter = isIsoDate(fromDateRaw) ? fromDateRaw : "";
  const toDateFilter = isIsoDate(toDateRaw) ? toDateRaw : "";
  const [dateFrom, dateTo] =
    fromDateFilter && toDateFilter && fromDateFilter > toDateFilter
      ? [toDateFilter, fromDateFilter]
      : [fromDateFilter, toDateFilter];
  const rawSort = params.sort ?? "publication_date_desc";
  const sortConfig = SORTABLE_CONFIG[rawSort] ?? SORTABLE_CONFIG["publication_date_desc"];
  const sortCol = sortConfig.col;
  const sortDir = sortConfig.dir;

  const supabase = await createClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id")
    .maybeSingle();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let entityOptionsQuery = supabase
    .from("announcements")
    .select("entity_name, entity_nif, publication_date")
    .not("entity_name", "is", null)
    .order("publication_date", { ascending: false })
    .limit(300);

  if (appUser?.tenant_id) {
    entityOptionsQuery = entityOptionsQuery.eq("tenant_id", appUser.tenant_id);
  }

  const { data: rawEntityOptions } = await entityOptionsQuery;

  const seenEntityKeys = new Set<string>();
  const entityOptions = (rawEntityOptions ?? [])
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

  let query = supabase
    .from("announcements")
    .select(
      "id, title, entity_name, publication_date, cpv_main, base_price, currency, status, source, proposal_deadline_at, act_type, procedure_type, contract_type, dr_announcement_no, base_announcement_id",
      { count: "exact" },
    );

  if (appUser?.tenant_id) query = query.eq("tenant_id", appUser.tenant_id);
  if (cpvFilters.length > 0) {
    query = query.or(buildCpvFilterClause(cpvFilters));
  }
  if (entityFilter) {
    const entityNameClause = buildEntityNameClause(entityFilter);
    const topLevelClauses = [
      ...(entityNameClause ? [entityNameClause] : []),
      ...(entityNifFilter.length >= 5 ? [`entity_nif.ilike.%${entityNifFilter}%`] : []),
    ];

    if (topLevelClauses.length === 1) {
      const [singleClause] = topLevelClauses;
      if (singleClause.startsWith("entity_name.ilike.")) {
        query = query.ilike("entity_name", singleClause.replace("entity_name.ilike.", ""));
      } else if (singleClause.startsWith("entity_nif.ilike.")) {
        query = query.ilike("entity_nif", singleClause.replace("entity_nif.ilike.", ""));
      } else {
        query = query.or(singleClause);
      }
    } else if (topLevelClauses.length > 1) {
      query = query.or(topLevelClauses.join(","));
    }
  }
  if (announcementNumberFilter) query = query.or(`dr_announcement_no.ilike.%${announcementNumberFilter}%,base_announcement_id.ilike.%${announcementNumberFilter}%`);
  if (actTypeFilters.length > 0) {
    query = query.in(
      "act_type",
      Array.from(new Set(actTypeFilters.flatMap((value) => actTypeFilterValues(value)))),
    );
  }
  if (procedureTypeFilters.length > 0) {
    query = query.in(
      "procedure_type",
      Array.from(new Set(procedureTypeFilters.flatMap((value) => modelTypeFilterValues(value)))),
    );
  }
  if (contractTypeFilters.length > 0) {
    query = query.in(
      "contract_type",
      Array.from(new Set(contractTypeFilters.flatMap((value) => contractTypeFilterValues(value)))),
    );
  }
  if (Number.isFinite(minValue)) query = query.gte("base_price", minValue);
  if (Number.isFinite(maxValue)) query = query.lte("base_price", maxValue);

  if (dateFrom) query = query.gte("publication_date", dateFrom);
  if (dateTo) query = query.lte("publication_date", dateTo);

  if (sortCol === "publication_date") {
    query = query
      .order("publication_date", { ascending: sortDir === "asc", nullsFirst: false })
      .order("created_at", { ascending: sortDir === "asc", nullsFirst: false })
      .order("id", { ascending: sortDir === "asc" });
  } else {
    query = query
      .order(sortCol, { ascending: sortDir === "asc", nullsFirst: false })
      .order("publication_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false });
  }

  query = query.range(from, to);

  const { data: announcements, count } = await query;

  const cpvShortCodes = Array.from(
    new Set(
      (announcements ?? [])
        .map((ann) => normalizeCpvCode(ann.cpv_main))
        .filter((code): code is string => Boolean(code && /^\d{8}$/.test(code))),
    ),
  );

  const cpvDisplayMap = new Map<string, string>();
  if (cpvShortCodes.length > 0) {
    const orFilter = cpvShortCodes
      .map((code) => `id.ilike.${code}-%`)
      .join(",");

    const { data: cpvRows } = await supabase
      .from("cpv_codes")
      .select("id")
      .or(orFilter)
      .limit(Math.max(50, cpvShortCodes.length * 3));

    for (const row of cpvRows ?? []) {
      const id = String((row as { id?: unknown }).id ?? "").trim();
      if (!id) continue;
      const core = cpvCore8(id);
      if (core && !cpvDisplayMap.has(core)) {
        cpvDisplayMap.set(core, id);
      }
    }
  }

  function displayCpv(raw: unknown): string | null {
    const normalized = normalizeCpvCode(raw);
    if (!normalized) return null;
    if (/^\d{8}$/.test(normalized)) return cpvDisplayMap.get(normalized) ?? normalized;
    return normalized;
  }

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);
  const now = new Date();

  function qs(overrides: Record<string, string | number> = {}) {
    const merged = {
      page: String(page),
      limit: String(PAGE_SIZE),
      cpv: cpvFilter,
      entity: entityFilter,
      announcement_number: announcementNumberFilter,
      min_value: minValueFilter,
      max_value: maxValueFilter,
      from_date: dateFrom,
      to_date: dateTo,
      sort: rawSort,
      ...Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, String(value)])),
    };

    const params = new URLSearchParams();
    Object.entries(merged).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
    actTypeFilters.forEach((value) => params.append("act_type", value));
    procedureTypeFilters.forEach((value) => params.append("procedure_type", value));
    contractTypeFilters.forEach((value) => params.append("contract_type", value));

    const query = params.toString();
    return `/announcements${query ? `?${query}` : ""}`;
  }

  function exportQs() {
    const params = new URLSearchParams();
    [
      ["cpv", cpvFilter],
      ["entity", entityFilter],
      ["announcement_number", announcementNumberFilter],
      ["min_value", minValueFilter],
      ["max_value", maxValueFilter],
      ["from_date", dateFrom],
      ["to_date", dateTo],
      ["sort", sortCol],
      ["dir", sortDir],
    ].forEach(([key, value]) => {
      if (value) params.append(key, value);
    });

    actTypeFilters.forEach((value) => params.append("act_type", value));
    procedureTypeFilters.forEach((value) => params.append("procedure_type", value));
    contractTypeFilters.forEach((value) => params.append("contract_type", value));

    const query = params.toString();
    return `/api/announcements/export${query ? `?${query}` : ""}`;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Megaphone}
        title="Anúncios"
        description={`${count ?? 0} anúncios`}
      />

      <form className="bg-white border border-surface-200 rounded-xl p-4 shadow-card space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <CpvMultiSearchInput
              name="cpv"
              defaultValue={cpvFilter}
              label="CPV"
              placeholder="CPV (ex: 331 ou 45000000)"
              compact
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Entidade Adjudicante</label>
            <EntitySearchInput
              name="entity"
              defaultValue={entityFilter}
              placeholder="Nome ou NIPC"
              minChars={2}
              options={entityOptions}
              className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Nº de Anúncio</label>
            <input
              name="announcement_number"
              defaultValue={announcementNumberFilter}
              placeholder="Nº DRE"
              className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
          </div>

          <div>
            <MercadoMultiSelect
              name="act_type"
              label="Tipo de ato"
              options={[...ACT_TYPE_CANONICAL]}
              defaultSelected={actTypeFilters}
            />
          </div>

          <div>
            <MercadoMultiSelect
              name="contract_type"
              label="Tipo de contrato"
              options={[...CONTRACT_TYPE_CANONICAL]}
              defaultSelected={contractTypeFilters}
            />
          </div>

          <div>
            <MercadoMultiSelect
              name="procedure_type"
              label="Tipo de Procedimento"
              options={[...MODEL_TYPE_CANONICAL]}
              defaultSelected={procedureTypeFilters}
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
                defaultValue={minValueFilter}
                placeholder="0"
              />
              <CurrencyValueField
                name="max_value"
                label="Máximo"
                defaultValue={maxValueFilter}
                placeholder="10000000"
              />
            </div>
          </div>

          <div className="h-full rounded-xl border border-gray-200 bg-white p-3">
            <label className="block text-xs text-gray-400 mb-2">Data de publicação</label>
            <MercadoDateDropdown name="from_date" defaultValue={dateFrom} />
          </div>

          <div className="h-full rounded-xl border border-gray-200 bg-white p-3">
            <label className="block text-xs text-gray-400 mb-2">Prazo de fim</label>
            <MercadoDateDropdown name="to_date" defaultValue={dateTo} />
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
              defaultValue={rawSort}
              options={[
                { value: "publication_date_desc", label: "Mais recentes" },
                { value: "publication_date_asc", label: "Mais antigos" },
                { value: "base_price_desc", label: "Maior valor" },
                { value: "base_price_asc", label: "Menor valor" },
                { value: "proposal_deadline_at_asc", label: "Fim mais próximo" },
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 items-center gap-2 pt-1 lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex justify-center lg:justify-start">
            <a
              href={exportQs()}
              download
              className="h-10 inline-flex items-center gap-2 bg-brand-600 text-white text-sm font-medium px-4 rounded-xl hover:bg-brand-700 transition-all shadow-sm hover:shadow-md"
            >
              <FileSpreadsheet className="h-4 w-4 text-white" />
              Exportar CSV
            </a>
          </div>

          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-xl px-5 text-sm font-semibold text-center text-white shadow-sm transition-all hover:opacity-90 lg:w-[360px]"
            style={{ background: "#39752a" }}
          >
            <Filter className="w-4 h-4" />
            Aplicar filtros selecionados
          </button>

          <div className="flex justify-center lg:justify-end">
            {(cpvFilter || entityFilter || announcementNumberFilter || actTypeFilters.length > 0 || procedureTypeFilters.length > 0 || contractTypeFilters.length > 0 || minValueFilter || maxValueFilter || dateFrom || dateTo) && (
              <Link
                href="/announcements"
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-500 transition-all hover:bg-gray-50 sm:w-auto"
              >
                Limpar
              </Link>
            )}
          </div>
        </div>
      </form>

      <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <SortTh label="Título" col="title" current={sortCol} dir={sortDir} href={qs} />
                <SortTh label="Entidade" col="entity_name" current={sortCol} dir={sortDir} href={qs} />
                <SortTh label="Data" col="publication_date" current={sortCol} dir={sortDir} href={qs} />
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  CPV
                </th>
                <SortTh label="Preço Base" col="base_price" current={sortCol} dir={sortDir} href={qs} align="right" />
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {(announcements ?? []).map((ann) => {
                const effective = effectiveStatus(ann, now);
                const cpvDisplay = displayCpv(ann.cpv_main);
                const title = cleanAnnouncementText(ann.title) || "Sem titulo";
                const entityName = cleanAnnouncementText(ann.entity_name) || "—";

                return (
                  <tr key={ann.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <Link
                        href={`/announcements/${ann.id}`}
                        className="text-brand-600 hover:underline font-medium line-clamp-2"
                      >
                        {title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">
                      {entityName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {ann.publication_date}
                    </td>
                    <td className="px-4 py-3">
                      {cpvDisplay ? (
                        <span className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono whitespace-nowrap">
                          {cpvDisplay}
                        </span>
                      ) : (
                        <span className="inline-block bg-surface-100 text-gray-500 text-xs px-2 py-0.5 rounded whitespace-nowrap">
                          Sem CPV
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium whitespace-nowrap">
                      {ann.base_price != null ? `${Number(ann.base_price).toLocaleString("pt-PT")} ${ann.currency}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[effective] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {STATUS_LABEL[effective] ?? effective}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(announcements ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    Nenhum anúncio encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (() => {
        const BTN = "px-3 py-1.5 text-sm font-medium bg-white border border-surface-200 rounded-xl hover:bg-surface-50 transition-all shadow-card";
        const ACTIVE = "px-3 py-1.5 text-sm font-medium rounded-xl bg-brand-600 text-white shadow-sm";
        const DOTS = "px-2 py-1.5 text-sm text-gray-300";
        const pages: (number | "dots")[] = [];
        const add = (pageNumber: number) => {
          if (!pages.includes(pageNumber)) pages.push(pageNumber);
        };

        add(1);
        if (page > 3) pages.push("dots");
        for (let index = Math.max(2, page - 1); index <= Math.min(totalPages - 1, page + 1); index++) add(index);
        if (page < totalPages - 2) pages.push("dots");
        if (totalPages > 1) add(totalPages);

        return (
          <div className="flex justify-center items-center gap-1 flex-wrap">
            {page > 1 && <Link href={qs({ page: page - 1 })} className={BTN}>← Anterior</Link>}
            {pages.map((pageNumber, index) =>
              pageNumber === "dots" ? (
                <span key={`dots-${index}`} className={DOTS}>...</span>
              ) : (
                <Link key={pageNumber} href={qs({ page: pageNumber })} className={pageNumber === page ? ACTIVE : BTN}>
                  {pageNumber}
                </Link>
              ),
            )}
            {page < totalPages && <Link href={qs({ page: page + 1 })} className={BTN}>Próxima →</Link>}
          </div>
        );
      })()}
    </div>
  );
}
