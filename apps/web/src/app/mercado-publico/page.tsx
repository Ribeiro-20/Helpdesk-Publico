import { createAdminClient, createClient } from "@/lib/supabase/server";
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

type ContractExtraRow = {
  id: string;
  contract_type: string | null;
  execution_deadline_days: number | null;
  execution_locations: unknown;
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

function locationMatches(
  locations: string[],
  country: string,
  district: string,
  municipality: string,
): boolean {
  if (country === "all" && district === "all" && municipality === "all") {
    return true;
  }

  for (const rawLocation of locations) {
    const parsed = parseExecutionLocation(rawLocation);

    if (country !== "all" && parsed.country !== country) continue;
    if (district !== "all" && parsed.district !== district) continue;
    if (municipality !== "all" && parsed.municipality !== municipality)
      continue;

    return true;
  }

  return false;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function closingDateIso(
  signingDate: string | null,
  deadlineDays: number | null | undefined,
): string | null {
  if (!signingDate || !deadlineDays || deadlineDays <= 0) return null;
  const start = new Date(`${signingDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + deadlineDays);
  return end.toISOString().slice(0, 10);
}

function inDateRange(
  value: string | null,
  fromDate: string,
  toDate: string,
): boolean {
  if (!value) return false;
  if (fromDate && value < fromDate) return false;
  if (toDate && value > toDate) return false;
  return true;
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
    params.date_field === "publication_date" ||
    params.date_field === "closing_date"
      ? params.date_field
      : "signing_date";
  const sortField = params.sort ?? "signing_date";
  const countryFilter = params.country ?? "all";
  const districtFilter = params.district ?? "all";
  const municipalityFilter = params.municipality ?? "all";

  const limitStr = (params.limit ?? "25").trim();
  const PAGE_SIZE = limitStr === "50" ? 50 : limitStr === "100" ? 100 : 25;

  const supabase = await createAdminClient();

  // Prefer the authenticated user's tenant (same behavior as dashboard).
  // For anonymous visitors, fallback to the first tenant so the page remains public.
  const authSupabase = await createClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  let tenantId = "00000000-0000-0000-0000-000000000000";

  if (user?.id) {
    const { data: appUser } = await supabase
      .from("app_users")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (appUser?.tenant_id) {
      tenantId = appUser.tenant_id;
    }
  }

  if (tenantId === "00000000-0000-0000-0000-000000000000") {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (tenant?.id) tenantId = tenant.id;
  }

  // Build facet options for contract type and hierarchical location filters.
  const { data: locationRows } = await supabase
    .from("contracts")
    .select("execution_locations")
    .eq("tenant_id", tenantId)
    .limit(5000);

  // Fetch all procedure/contract types (no limit) to populate filters correctly
  const { data: procedureRows } = await supabase
    .from("contracts")
    .select("procedure_type")
    .eq("tenant_id", tenantId);

  const { data: contractTypeRows } = await supabase
    .from("contracts")
    .select("contract_type")
    .eq("tenant_id", tenantId);

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

  const selectedCountry =
    countryFilter !== "all" && countryOptions.includes(countryFilter)
      ? countryFilter
      : "all";

  const districtOptions =
    selectedCountry !== "all"
      ? Array.from(locationTree.get(selectedCountry)?.keys() ?? []).sort(
          (a, b) => a.localeCompare(b, "pt-PT"),
        )
      : [];

  const selectedDistrict =
    selectedCountry !== "all" &&
    districtFilter !== "all" &&
    districtOptions.includes(districtFilter)
      ? districtFilter
      : "all";

  const municipalityOptions =
    selectedCountry !== "all" && selectedDistrict !== "all"
      ? Array.from(
          locationTree.get(selectedCountry)?.get(selectedDistrict) ?? [],
        ).sort((a, b) => a.localeCompare(b, "pt-PT"))
      : [];

  const selectedMunicipality =
    selectedCountry !== "all" &&
    selectedDistrict !== "all" &&
    municipalityFilter !== "all" &&
    municipalityOptions.includes(municipalityFilter)
      ? municipalityFilter
      : "all";

  // Only force client-side filtering (fetch all) if we are filtering by fields
  // that CANNOT be handled efficiently by the DB/RPC with current logic.
  // Location filters require JS parsing, so they force extended filtering.
  // CPV is handled by RPC, so it doesn't need extended filtering.
  const hasLocationFilters =
    selectedCountry !== "all" ||
    selectedDistrict !== "all" ||
    selectedMunicipality !== "all";

  const needsExtendedFiltering =
    contractTypeFilters.length > 0 ||
    procedureFilters.length > 0 ||
    hasLocationFilters;

  const rpcOffset = needsExtendedFiltering ? 0 : (page - 1) * PAGE_SIZE;
  const rpcLimit = needsExtendedFiltering ? 50000 : PAGE_SIZE;

  let totalCount = 0;
  let contracts: ContractRow[] = [];

  // -------------------------------------------------------------------
  // If procedure, contract_type OR CPV filters are active, query DB directly.
  // This guarantees CPV prefix semantics (cpv%) instead of contains semantics.
  // -------------------------------------------------------------------
  const hasTypeFilters =
    contractTypeFilters.length > 0 ||
    procedureFilters.length > 0 ||
    cpvFilter.length > 0 ||
    selectedDateField !== "signing_date";

  const requiresClientDateFiltering = selectedDateField === "closing_date";

  if (hasTypeFilters) {
    // Build a direct query applying exact filters at DB level
    let q = supabase
      .from("contracts")
      .select(
        "id, object, procedure_type, contract_type, signing_date, publication_date, cpv_main, contract_price, base_price, status, contracting_entities, winners, execution_deadline_days, execution_locations",
        { count: "exact" },
      )
      .eq("tenant_id", tenantId);

    if (contractTypeFilters.length > 0)
      q = q.in("contract_type", contractTypeFilters);
    if (procedureFilters.length > 0)
      q = q.in("procedure_type", procedureFilters);
    if (entityFilter)
      q = (q as any).ilike("contracting_entities", `%${entityFilter}%`);
    if (winnerFilter) q = (q as any).ilike("winners", `%${winnerFilter}%`);
    if (cpvFilter) q = q.ilike("cpv_main", `${cpvFilter}%`);
    if (minValue) q = q.gte("contract_price", parseFloat(minValue));
    if (maxValue) q = q.lte("contract_price", parseFloat(maxValue));
    if (selectedDateField === "signing_date") {
      if (fromDate) q = q.gte("signing_date", fromDate);
      if (toDate) q = q.lte("signing_date", toDate);
    } else if (selectedDateField === "publication_date") {
      if (fromDate) q = q.gte("publication_date", fromDate);
      if (toDate) q = q.lte("publication_date", toDate);
    }

    // Apply sort
    if (sortField === "value_desc")
      q = q.order("contract_price", { ascending: false, nullsFirst: false });
    else if (sortField === "value_asc")
      q = q.order("contract_price", { ascending: true, nullsFirst: false });
    else if (sortField === "publication_date")
      q = q.order("publication_date", { ascending: false, nullsFirst: false });
    else q = q.order("signing_date", { ascending: false, nullsFirst: false });

    // If NO location filters are active, we can paginate directly in DB (performant for millions of rows)
    if (!hasLocationFilters && !requiresClientDateFiltering) {
      // Apply pagination directly to query
      const offsetDB = (page - 1) * PAGE_SIZE;
      q = q.range(offsetDB, offsetDB + PAGE_SIZE - 1);

      const { data: directRows, count: directCount } = await q;

      contracts = (directRows ?? []).map((row: any) => ({
        ...row,
        execution_locations: toStringArray(row.execution_locations),
      })) as ContractRow[];
      totalCount = directCount ?? 0;
    } else {
      // Fallback for location filters: fetch up to limit, filter in JS (slower, capped)
      const { data: directRows } = await q.limit(50000);

      let filteredDirect = (directRows ?? []).map((row: any) => ({
        ...row,
        execution_locations: toStringArray(row.execution_locations),
      })) as ContractRow[];

      filteredDirect = filteredDirect.filter((row) => {
        const locationOk = locationMatches(
          row.execution_locations ?? [],
          selectedCountry,
          selectedDistrict,
          selectedMunicipality,
        );
        if (!locationOk) return false;

        if (selectedDateField === "closing_date") {
          const closingDate = closingDateIso(
            row.signing_date,
            row.execution_deadline_days,
          );
          return inDateRange(closingDate, fromDate, toDate);
        }

        return true;
      });

      totalCount = filteredDirect.length;
      const totalPagesF = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
      const safePageF = Math.min(page, totalPagesF);
      const offsetF = (safePageF - 1) * PAGE_SIZE;
      contracts = filteredDirect.slice(offsetF, offsetF + PAGE_SIZE);
    }
  } else {
    const { data: rpcResult } = await supabase.rpc("search_contracts", {
      p_tenant_id: tenantId,
      p_entity_nif: entityFilter || null,
      p_winner_nif: winnerFilter || null,
      p_cpv: cpvFilter || null,
      p_procedure: null, // multi-select filters applied JS-side
      p_min_value: minValue ? parseFloat(minValue) : null,
      p_max_value: maxValue ? parseFloat(maxValue) : null,
      p_from_date: fromDate || null,
      p_to_date: toDate || null,
      p_sort: sortField,
      p_offset: rpcOffset,
      p_limit: rpcLimit,
    });

    let rpcRows: ContractRow[] = [];
    let rpcTotalCount = 0;

    if (rpcResult && Array.isArray(rpcResult) && rpcResult.length > 0) {
      const result = rpcResult[0] as {
        rows: ContractRow[];
        total_count: number;
      };
      rpcRows = Array.isArray(result.rows) ? result.rows : [];
      rpcTotalCount = result.total_count ?? 0;
    }

    const ids = rpcRows.map((row) => row.id).filter(Boolean);
    const extrasById = new Map<
      string,
      {
        contract_type: string | null;
        execution_deadline_days: number | null;
        execution_locations: string[];
      }
    >();

    for (const idChunk of chunkArray(ids, 200)) {
      const { data: extraRows } = await supabase
        .from("contracts")
        .select(
          "id, contract_type, execution_deadline_days, execution_locations",
        )
        .in("id", idChunk);

      for (const row of (extraRows ?? []) as ContractExtraRow[]) {
        extrasById.set(row.id, {
          contract_type: row.contract_type,
          execution_deadline_days: row.execution_deadline_days,
          execution_locations: toStringArray(row.execution_locations),
        });
      }
    }

    let mergedRows: ContractRow[] = rpcRows.map((row) => {
      const extra = extrasById.get(row.id);
      return {
        ...row,
        contract_type: extra?.contract_type ?? null,
        execution_deadline_days: extra?.execution_deadline_days ?? null,
        execution_locations: extra?.execution_locations ?? [],
      };
    });

    // Only apply JS filtering if we are in "extended filtering" mode (client-side pagination).
    // If we used server-side pagination (needsExtendedFiltering === false), the rows are already correct for the page.
    if (needsExtendedFiltering && cpvFilter) {
      const cpvPrefix = cpvFilter.toLowerCase();
      mergedRows = mergedRows.filter((row) =>
        (row.cpv_main ?? "").toLowerCase().startsWith(cpvPrefix),
      );
    }

    if (contractTypeFilters.length > 0) {
      mergedRows = mergedRows.filter(
        (row) =>
          row.contract_type != null &&
          contractTypeFilters.includes(row.contract_type),
      );
    }

    if (procedureFilters.length > 0) {
      mergedRows = mergedRows.filter(
        (row) =>
          row.procedure_type != null &&
          procedureFilters.includes(row.procedure_type),
      );
    }

    if (
      selectedCountry !== "all" ||
      selectedDistrict !== "all" ||
      selectedMunicipality !== "all"
    ) {
      mergedRows = mergedRows.filter((row) =>
        locationMatches(
          row.execution_locations ?? [],
          selectedCountry,
          selectedDistrict,
          selectedMunicipality,
        ),
      );
    }

    if (needsExtendedFiltering) {
      totalCount = mergedRows.length;
      const totalPagesFiltered = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
      const safePageFiltered = Math.min(page, totalPagesFiltered);
      const offset = (safePageFiltered - 1) * PAGE_SIZE;
      contracts = mergedRows.slice(offset, offset + PAGE_SIZE);
    } else {
      totalCount = rpcTotalCount;
      contracts = mergedRows;
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
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
  if (selectedDateField !== "signing_date") {
    qsParams.set("date_field", selectedDateField);
  }
  if (sortField) qsParams.set("sort", sortField);
  if (PAGE_SIZE !== 25) qsParams.set("limit", PAGE_SIZE.toString());
  const buildQsBase = qsParams.toString()
    ? `/mercado-publico?${qsParams.toString()}`
    : "/mercado-publico";

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
                Estatísticas de Mercado
              </h1>
              <p className="text-gray-500 text-sm">
                {totalCount} contratos celebrados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <Link
              href="/"
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
                <label className="block text-xs text-gray-400">Data de início</label>
                <InfoPopover text="Data inicial para o tipo de data selecionado." />
              </div>
              <MercadoDateDropdown name="from_date" defaultValue={fromDate} />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-center gap-1 mb-2">
                <label className="block text-xs text-gray-400">Data de fim</label>
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
                  { value: "signing_date", label: "Data de celebração" },
                  { value: "publication_date", label: "Data de contrato" },
                  { value: "closing_date", label: "Data de encerramento" },
                ]}
              />
            </div>

            <div className="w-full">
              <div className="flex items-center gap-1 mb-1">
                <label className="block text-xs text-gray-400">
                  Preço contratual mínimo
                </label>
                <InfoPopover text="Valor mínimo do contrato em euros." />
              </div>
              <input
                name="min_value"
                type="number"
                defaultValue={minValue}
                placeholder="0"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
              />
            </div>

            <div className="w-full">
              <div className="flex items-center gap-1 mb-1">
                <label className="block text-xs text-gray-400">
                  Preço contratual máximo
                </label>
                <InfoPopover text="Valor máximo do contrato em euros." />
              </div>
              <input
                name="max_value"
                type="number"
                defaultValue={maxValue}
                placeholder="10000000"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
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
                <option value="signing_date">Mais recentes</option>
                <option value="publication_date">Data de publicação</option>
                <option value="value_desc">Maior preço contratual</option>
                <option value="value_asc">Menor preço contratual</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 pt-2 md:pt-0">
            <button
              type="submit"
              className="w-full md:w-[360px] inline-flex items-center justify-center gap-1 px-6 py-2 rounded-xl text-sm font-medium text-white transition-all shadow-sm hover:opacity-90 h-[42px]"
              style={{ background: "rgba(74, 222, 128, 1)", color: "#1a1a1a" }}
            >
              <Filter className="w-4 h-4" />
              Aplicar filtros selecionados
            </button>
            {hasFilters && (
              <Link
                href="/mercado-publico"
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
          hasFilters={hasFilters}
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
