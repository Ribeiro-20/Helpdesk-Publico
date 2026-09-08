import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import { FileText, Filter, House } from "lucide-react";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";
import ContractsTable, { type ContractRow } from "@/components/ContractsTable";
import MercadoCpvInput from "@/components/MercadoCpvInput";
import MercadoDateDropdown from "@/components/MercadoDateDropdown";
import MercadoMultiSelect from "@/components/MercadoMultiSelect";
import MercadoSingleSelect from "@/components/MercadoSingleSelect";
import MercadoLocationFilters from "@/components/MercadoLocationFilters";
import InfoPopover from "@/components/InfoPopover";
import BackButton from "@/components/BackButton";
import PriceInput from "@/components/PriceInput";

export const metadata = {
  title: "Contratos Públicos | Helpdesk Público",
  description:
    "Consulte todos os Contratos Públicos publicados. Pesquise Entidades Adjudicantes, Adjudicatários e o detalhe de cada contrato na Contratação Pública.",
};

export const dynamic = "force-dynamic";

type MercadoSearchParams = {
  page?: string;
  cpv?: string;
  entity?: string;
  winner?: string;
  procedure?: string | string[];
  contract_type?: string | string[];
  country?: string;
  district?: string;
  municipality?: string;
  min_value?: string;
  max_value?: string;
  from_date?: string;
  to_date?: string;
  date_field?: string;
  sort?: string;
  limit?: string;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseExecutionLocation(raw: string): {
  country: string;
  district: string;
  municipality: string;
} {
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    country: parts[0] ?? "",
    district: parts[1] ?? "",
    municipality: parts.slice(2).join(", "),
  };
}

export default async function MercadoPublicoPage({
  searchParams,
}: {
  searchParams: Promise<MercadoSearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const cpvFilter = (params.cpv ?? "").trim();
  const entityFilter = (params.entity ?? "").trim();
  const winnerFilter = (params.winner ?? "").trim();
  // Helper: parse a URL param that may be a single string or array of strings
  function getArrayParam(v: string | string[] | undefined): string[] {
    if (!v) return [];
    return (Array.isArray(v) ? v : [v])
      .flatMap((s) => s.split("|"))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const procedureFilters = getArrayParam(params.procedure);
  const contractTypeFilters = getArrayParam(params.contract_type);
  const minValue = (params.min_value ?? "").trim();
  const maxValue = (params.max_value ?? "").trim();
  const fromDate = (params.from_date ?? "").trim();
  const toDate = (params.to_date ?? "").trim();
  const selectedDateField =
    params.date_field === "signing_date" ||
    params.date_field === "closing_date"
      ? params.date_field
      : "publication_date";
  const sortField = params.sort ?? "publication_date";
  const countryFilter = params.country ?? "all";
  const districtFilter = params.district ?? "all";
  const municipalityFilter = params.municipality ?? "all";

  const limitStr = (params.limit ?? "25").trim();
  const PAGE_SIZE = limitStr === "50" ? 50 : limitStr === "100" ? 100 : 25;

  const supabase = await createAdminClient();

  // This installation has one public market tenant. Avoid consulting Supabase Auth
  // on this anonymous route: invalid/stale cookies must not trigger token-refresh
  // traffic before every public search.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();

  const tenantId = tenant?.id ?? "00000000-0000-0000-0000-000000000000";

  // Build facet options for contract type and hierarchical location filters.
  const { data: locationRows } = await supabase
    .from("contracts")
    .select("execution_locations")
    .eq("tenant_id", tenantId)
    .limit(5000);

  await supabase.from("contracts").select("procedure_type").eq("tenant_id", tenantId).limit(1);
  await supabase.from("contracts").select("contract_type").eq("tenant_id", tenantId).limit(1);

  // Seed with known standard types
  const contractTypeSet = new Set<string>([
    "Aquisição de bens móveis",
    "Aquisição de serviços",
    "Concessão de obras públicas",
    "Concessão de serviços públicos",
    "Empreitadas de obras públicas",
    "Locação de bens móveis",
    "Sociedade",
    "Outros",
  ]);

  const procedureTypeSet = new Set<string>([
    "Consulta Prévia",
    "Ajuste Direto Regime Geral",
    "Concurso público",
    "Concurso limitado por prévia qualificação",
    "Procedimento de negociação",
    "Diálogo concorrencial",
    "Ao abrigo de acordo-quadro (art.º 258.º)",
    "Ao abrigo de acordo-quadro (art.º 259.º)",
    "Parceria para a inovação",
    "Disponibilização de bens móveis",
    "Serviços sociais e outros serviços específicos",
    "Concurso de conceção simplificado",
    "Concurso de ideias simplificado",
    "Consulta Prévia Simplificada",
    "Concurso público simplificado",
    "Concurso limitado por prévia qualificação simplificado",
    "Ajuste Direto Regime Geral ao abrigo do artigo 7º da Lei n.º 30/2021, de 21.05",
    "Consulta prévia ao abrigo do artigo 7º da Lei n.º 30/2021, de 21.05",
    "Ajuste direto simplificado",
    "Ajuste direto simplificado ao abrigo da Lei n.º 30/2021, de 21.05",
    "Setores especiais – isenção parte II",
    "Contratação excluída II",
  ]);

  const locationTree = new Map<string, Map<string, Set<string>>>();
  // Pre-seed with standard countries from Portal BASE
  [
    "Portugal",
    "Afeganistão",
    "África do Sul",
    "Albânia",
    "Alemanha",
    "Andorra",
    "Angola",
    "Anguila",
    "Antárctida",
    "Antígua e Barbuda",
    "Antilhas Holandesas",
    "Arábia Saudita",
    "Argélia",
    "Argentina",
    "Arménia",
    "Aruba",
    "Austrália",
    "Áustria",
    "Azerbaijão",
    "Baamas",
    "Bangladeche",
    "Barbados",
    "Barém",
    "Bélgica",
    "Belize",
    "Benim",
    "Bermudas",
    "Bielorrússia",
    "Bolívia",
    "Bósnia e Herzegovina",
    "Botsuana",
    "Brasil",
    "Brunei",
    "Bulgária",
    "Burquina Faso",
    "Burundi",
    "Butão",
    "Cabo Verde",
    "Camarões",
    "Camboja",
    "Canadá",
    "Catar",
    "Cazaquistão",
    "Chade",
    "Chile",
    "China",
    "Chipre",
    "Colômbia",
    "Comores",
    "Congo",
    "Coreia do Norte",
    "Coreia do Sul",
    "Costa do Marfim",
    "Costa Rica",
    "Croácia",
    "Cuba",
    "Dinamarca",
    "Djibuti",
    "Dominica",
    "Egito",
    "El Salvador",
    "Emirados Árabes Unidos",
    "Equador",
    "Eritreia",
    "Eslováquia",
    "Eslovénia",
    "Espanha",
    "Estados Unidos",
    "Estónia",
    "Etiópia",
    "Fiji",
    "Filipinas",
    "Finlândia",
    "França",
    "Gabão",
    "Gâmbia",
    "Gana",
    "Geórgia",
    "Gibraltar",
    "Granada",
    "Grécia",
    "Gronelândia",
    "Guame",
    "Guatemala",
    "Guiana",
    "Guiana Francesa",
    "Guiné",
    "Guiné Equatorial",
    "Guiné-Bissau",
    "Haiti",
    "Honduras",
    "Hong Kong",
    "Hungria",
    "Iémen",
    "Ilha Bouvet",
    "Ilha Christmas",
    "Ilha Norfolk",
    "Ilhas Caimão",
    "Ilhas Cocos (Keeling)",
    "Ilhas Cook",
    "Ilhas Malvinas (Falkland)",
    "Ilhas Faroé",
    "Ilhas Heard e McDonald",
    "Ilhas Marianas do Norte",
    "Ilhas Marshall",
    "Ilhas Menores Distantes dos Estados Unidos",
    "Ilhas Salomão",
    "Ilhas Turcas e Caicos",
    "Ilhas Virgens Britânicas",
    "Ilhas Virgens dos Estados Unidos",
    "Ilhas Wallis e Futuna",
    "Índia",
    "Indonésia",
    "Irão",
    "Iraque",
    "Irlanda",
    "Islândia",
    "Israel",
    "Itália",
    "Jamaica",
    "Japão",
    "Jordânia",
    "Kiribati",
    "Kuwait",
    "Laos",
    "Lesoto",
    "Letónia",
    "Líbano",
    "Libéria",
    "Líbia",
    "Listenstaine",
    "Lituânia",
    "Luxemburgo",
    "Macau",
    "Macedónia",
    "Madagáscar",
    "Malásia",
    "Maláui",
    "Maldivas",
    "Mali",
    "Malta",
    "Marrocos",
    "Martinica",
    "Maurícia",
    "Mauritânia",
    "Maiote",
    "México",
    "Micronésia",
    "Moçambique",
    "Moldávia",
    "Mónaco",
    "Mongólia",
    "Monserrate",
    "Mianmar",
    "Namíbia",
    "Nauru",
    "Nepal",
    "Nicarágua",
    "Níger",
    "Nigéria",
    "Niue",
    "Noruega",
    "Nova Caledónia",
    "Nova Zelândia",
    "Omã",
    "Países Baixos",
    "Palau",
    "Palestina",
    "Panamá",
    "Papua Nova Guiné",
    "Paquistão",
    "Paraguai",
    "Peru",
    "Polinésia Francesa",
    "Polónia",
    "Porto Rico",
    "Quénia",
    "Quirguizistão",
    "Reino Unido",
    "República Centro-Africana",
    "República Checa",
    "República Democrática do Congo",
    "República Dominicana",
    "Reunião",
    "Roménia",
    "Ruanda",
    "Rússia",
    "Saara Ocidental",
    "Samoa",
    "Samoa Americana",
    "Santa Helena",
    "Santa Lúcia",
    "São Cristóvão e Neves",
    "São Marino",
    "São Pedro e Miquelão",
    "São Tomé e Príncipe",
    "São Vicente e Granadinas",
    "Senegal",
    "Serra Leoa",
    "Sérvia e Montenegro",
    "Seicheles",
    "Singapura",
    "Síria",
    "Somália",
    "Sri Lanca",
    "Suazilândia",
    "Sudão",
    "Suécia",
    "Suíça",
    "Suriname",
    "Svalbard e Jan Mayen",
    "Tailândia",
    "Taiwan",
    "Tajiquistão",
    "Tanzânia",
    "Território Britânico do Oceano Índico",
    "Territórios Franceses do Sul",
    "Timor-Leste",
    "Togo",
    "Tokelau",
    "Tonga",
    "Trindade e Tobago",
    "Tunísia",
    "Turquemenistão",
    "Turquia",
    "Tuvalu",
    "Ucrânia",
    "Uganda",
    "Uruguai",
    "Usbequistão",
    "Vanuatu",
    "Vaticano",
    "Venezuela",
    "Vietname",
    "Zâmbia",
    "Zimbabué",
  ].forEach((country) => locationTree.set(country, new Map()));

  for (const row of locationRows ?? []) {
    for (const rawLocation of toStringArray(row.execution_locations)) {
      const { country, district, municipality } =
        parseExecutionLocation(rawLocation);
      if (!country) continue;

      if (!locationTree.has(country)) {
        locationTree.set(country, new Map());
      }

      if (!district) continue;

      const countryMap = locationTree.get(country)!;
      if (!countryMap.has(district)) {
        countryMap.set(district, new Set());
      }

      if (municipality) {
        countryMap.get(district)!.add(municipality);
      }
    }
  }

  const contractTypeOptions = Array.from(contractTypeSet);
  const procedureTypeOptions = Array.from(procedureTypeSet);

  const countryOptions = Array.from(locationTree.keys()).sort((a, b) => {
    if (a === "Portugal") return -1;
    if (b === "Portugal") return 1;
    return a.localeCompare(b, "pt-PT");
  });
  const locationOptionsByCountry: Record<string, Record<string, string[]>> = {};

  for (const [country, districtMap] of Array.from(locationTree.entries()).sort(
    (a, b) => a[0].localeCompare(b[0], "pt-PT"),
  )) {
    locationOptionsByCountry[country] = {};

    for (const [district, municipalitySet] of Array.from(
      districtMap.entries(),
    ).sort((a, b) => a[0].localeCompare(b[0], "pt-PT"))) {
      locationOptionsByCountry[country][district] = Array.from(
        municipalitySet,
      ).sort((a, b) => a.localeCompare(b, "pt-PT"));
    }
  }

  // Facets are sampled only to populate the dropdowns. URL filters are accepted
  // independently so a valid location outside that sample is never reset to "all".
  const selectedCountry =
    countryFilter.trim() && countryFilter !== "all" ? countryFilter.trim() : "all";

  const districtOptions =
    selectedCountry !== "all"
      ? Array.from(locationTree.get(selectedCountry)?.keys() ?? []).sort(
          (a, b) => a.localeCompare(b, "pt-PT"),
        )
      : [];

  const selectedDistrict =
    districtFilter.trim() && districtFilter !== "all"
      ? districtFilter.trim()
      : "all";

  const municipalityOptions =
    selectedCountry !== "all" && selectedDistrict !== "all"
      ? Array.from(
          locationTree.get(selectedCountry)?.get(selectedDistrict) ?? [],
        ).sort((a, b) => a.localeCompare(b, "pt-PT"))
      : [];

  const selectedMunicipality =
    municipalityFilter.trim() && municipalityFilter !== "all"
      ? municipalityFilter.trim()
      : "all";

  // Every result filter and pagination request goes through the same
  // service-only, deduplicated RPC. Facet sampling never limits the search.
  const rpcBaseArgs = {
    p_tenant_id: tenantId,
    p_entity: entityFilter || null,
    p_winner: winnerFilter || null,
    p_cpv: cpvFilter || null,
    p_procedures: procedureFilters.length > 0 ? procedureFilters : null,
    p_contract_types: contractTypeFilters.length > 0 ? contractTypeFilters : null,
    p_country: selectedCountry !== "all" ? selectedCountry : null,
    p_district: selectedDistrict !== "all" ? selectedDistrict : null,
    p_municipality: selectedMunicipality !== "all" ? selectedMunicipality : null,
    p_min_value: minValue ? parseFloat(minValue) : null,
    p_max_value: maxValue ? parseFloat(maxValue) : null,
    p_from_date: fromDate || null,
    p_to_date: toDate || null,
    p_date_field: selectedDateField,
    p_sort: sortField,
    p_limit: PAGE_SIZE,
  };

  const parseRpcSearch = (value: unknown): {
    rows: ContractRow[];
    totalCount: number;
  } => {
    const result = (Array.isArray(value) ? value[0] : value) as
      | { rows?: ContractRow[] | string; total_count?: number }
      | null;
    if (!result) return { rows: [], totalCount: 0 };

    const rawRows =
      typeof result.rows === "string"
        ? (JSON.parse(result.rows) as ContractRow[])
        : result.rows;
    return {
      rows: Array.isArray(rawRows) ? rawRows : [],
      totalCount: Number(result.total_count ?? 0),
    };
  };

  const runRpcSearch = (targetPage: number) =>
    supabase.rpc("search_public_contracts", {
      ...rpcBaseArgs,
      p_offset: (targetPage - 1) * PAGE_SIZE,
    });

  let totalCount = 0;
  let contracts: ContractRow[] = [];
  let queryError = false;
  let resolvedPage = page;

  let rpcResponse = await runRpcSearch(page);
  if (rpcResponse.error) {
    console.error("[public-contracts] RPC query failed", rpcResponse.error);
    queryError = true;
  } else {
    let parsed = parseRpcSearch(rpcResponse.data);
    totalCount = parsed.totalCount;
    const rpcTotalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    resolvedPage = Math.min(page, rpcTotalPages);

    // An out-of-range URL must render the resolved last page, not an empty page
    // whose pagination label claims to be valid.
    if (resolvedPage !== page && totalCount > 0) {
      rpcResponse = await runRpcSearch(resolvedPage);
      if (rpcResponse.error) {
        console.error("[public-contracts] resolved-page RPC failed", rpcResponse.error);
        queryError = true;
        parsed = { rows: [], totalCount };
      } else {
        parsed = parseRpcSearch(rpcResponse.data);
        totalCount = parsed.totalCount;
      }
    }

    contracts = parsed.rows.map((row) => ({
      ...row,
      execution_locations: toStringArray(row.execution_locations),
    }));
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = resolvedPage;
  const hasFilters = !!(
    cpvFilter ||
    entityFilter ||
    winnerFilter ||
    procedureFilters.length > 0 ||
    contractTypeFilters.length > 0 ||
    selectedCountry !== "all" ||
    selectedDistrict !== "all" ||
    selectedMunicipality !== "all" ||
    minValue ||
    maxValue ||
    fromDate ||
    toDate
  );

  // Build base query string (without page) for ContractsTable
  const qsParams = new URLSearchParams();
  if (cpvFilter) qsParams.set("cpv", cpvFilter);
  if (entityFilter) qsParams.set("entity", entityFilter);
  if (winnerFilter) qsParams.set("winner", winnerFilter);
  if (procedureFilters.length > 0)
    procedureFilters.forEach((v) => qsParams.append("procedure", v));
  if (contractTypeFilters.length > 0)
    contractTypeFilters.forEach((v) => qsParams.append("contract_type", v));
  if (selectedCountry !== "all") qsParams.set("country", selectedCountry);
  if (selectedDistrict !== "all") qsParams.set("district", selectedDistrict);
  if (selectedMunicipality !== "all")
    qsParams.set("municipality", selectedMunicipality);
  if (minValue) qsParams.set("min_value", minValue);
  if (maxValue) qsParams.set("max_value", maxValue);
  if (fromDate) qsParams.set("from_date", fromDate);
  if (toDate) qsParams.set("to_date", toDate);
  if (selectedDateField !== "publication_date") {
    qsParams.set("date_field", selectedDateField);
  }
  if (sortField) qsParams.set("sort", sortField);
  if (PAGE_SIZE !== 25) qsParams.set("limit", PAGE_SIZE.toString());
  const buildQsBase = qsParams.toString()
    ? `/mp/contratos-publicos?${qsParams.toString()}`
    : "/mp/contratos-publicos";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "rgba(248, 250, 252, 1)" }}
    >
      <Header />

      {/* ── MAIN ── */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 md:px-6 py-6 md:py-10 space-y-6">
        {/* Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-green-500 shrink-0" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 leading-tight">
                Contratos Públicos
              </h1>
              <p className="text-gray-500 text-sm">
                {totalCount} contratos publicados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <Link
              href="/mp"
              className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
            >
              <House className="h-4 w-4" />
              Página inicial
            </Link>
            <BackButton fallbackHref="/" className="w-fit shrink-0" />
          </div>
        </div>

        {/* Filters */}
        <form className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <MercadoCpvInput defaultValue={cpvFilter} />
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="block text-xs text-gray-400">
                  Entidade Adjudicante
                </label>
                <InfoPopover text="Indique nome ou NIPC da Entidade que pretende pesquisar" />
              </div>
              <input
                name="entity"
                defaultValue={entityFilter}
                placeholder="Nome ou NIPC"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
              />
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="block text-xs text-gray-400">
                  Adjudicatário
                </label>
                <InfoPopover text="Indique o nome ou NIPC do Adjudicatário que pretende pesquisar" />
              </div>
              <input
                name="winner"
                defaultValue={winnerFilter}
                placeholder="Nome ou NIPC"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
              />
            </div>
            <div className="relative z-20">
              <MercadoMultiSelect
                name="procedure"
                label="Tipo de procedimento"
                options={procedureTypeOptions}
                defaultSelected={procedureFilters}
              />
            </div>
            <div className="relative z-10">
              <MercadoMultiSelect
                name="contract_type"
                label="Tipo de contrato"
                options={contractTypeOptions}
                defaultSelected={contractTypeFilters}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-center gap-1 mb-2">
                <label className="block text-xs text-gray-400">
                  Data de início
                </label>
                <InfoPopover text="Data inicial para o tipo de data selecionado." />
              </div>
              <MercadoDateDropdown name="from_date" defaultValue={fromDate} />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-center gap-1 mb-2">
                <label className="block text-xs text-gray-400">
                  Data de fim
                </label>
                <InfoPopover text="Data final para o tipo de data selecionado." />
              </div>
              <MercadoDateDropdown name="to_date" defaultValue={toDate} />
            </div>

            <div>
              <MercadoSingleSelect
                name="date_field"
                label="Critério de data"
                defaultValue={selectedDateField}
                options={[
                  { value: "publication_date", label: "Data de publicação do contrato" },
                  { value: "signing_date", label: "Data de celebração" },
                  { value: "closing_date", label: "Data de encerramento" },
                ]}
              />
            </div>

            <div className="w-full">
              <label className="block text-xs text-gray-400 mb-1">
                Preço contratual mínimo (€)
              </label>
              <PriceInput name="min_value" defaultValue={minValue} placeholder="0" />
            </div>

            <div className="w-full">
              <label className="block text-xs text-gray-400 mb-1">
                Preço contratual máximo (€)
              </label>
              <PriceInput name="max_value" defaultValue={maxValue} placeholder="10000000"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <MercadoLocationFilters
              locationOptionsByCountry={locationOptionsByCountry}
              defaultCountry={selectedCountry}
              defaultDistrict={selectedDistrict}
              defaultMunicipality={selectedMunicipality}
            />

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Apresentar
              </label>
              <select
                name="limit"
                defaultValue={PAGE_SIZE.toString()}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all bg-white w-full h-[42px]"
              >
                <option value="25">25 contratos</option>
                <option value="50">50 contratos</option>
                <option value="100">100 contratos</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Ordenar por
              </label>
              <select
                name="sort"
                defaultValue={sortField}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all bg-white w-full h-[42px]"
              >
                <option value="publication_date">Mais recentes</option>
                <option value="signing_date">Data de celebração</option>
                <option value="value_desc">Maior preço contratual</option>
                <option value="value_asc">Menor preço contratual</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 pt-2 md:pt-0">
            <button
              type="submit"
              className="w-full md:w-[360px] inline-flex items-center justify-center gap-1 px-6 py-2 rounded-xl text-sm font-medium text-white transition-all shadow-sm hover:opacity-90 h-[42px]"
              style={{ background: "#3f6f27", color: "#ffffff" }}
            >
              <Filter className="w-4 h-4" />
              Aplicar filtros selecionados
            </button>
            {hasFilters && (
              <Link
                href="/mp/contratos-publicos"
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all h-[42px]"
              >
                Limpar
              </Link>
            )}
          </div>
        </form>

        {/* Table + Pagination + Modal */}
        <ContractsTable
          contracts={contracts}
          queryError={queryError}
          dateField={selectedDateField}
          totalPages={totalPages}
          page={safePage}
          buildQsBase={buildQsBase}
        />
      </main>

      {/* ── FOOTER ── */}
      <PublicFooter />
    </div>
  );
}
