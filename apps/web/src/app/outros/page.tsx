import { createAdminClient, createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { TrendingUp, AlertTriangle, Filter, House } from "lucide-react";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";
import BackButton from "@/components/BackButton";
import MarketIntelligenceTable from "@/components/MarketIntelligenceTable";
import MercadoCpvInput from "@/components/MercadoCpvInput";
import MercadoDateDropdown from "@/components/MercadoDateDropdown";
import MercadoMultiSelect from "@/components/MercadoMultiSelect";
import MercadoSingleSelect from "@/components/MercadoSingleSelect";
import MercadoLocationFilters from "@/components/MercadoLocationFilters";
import InfoPopover from "@/components/InfoPopover";
import PriceInput from "@/components/PriceInput";

export const metadata = {
  title: "Market Intelligence em Contratação Pública | Helpdesk Público",
  description:
    "Identifique oportunidades na Contratação Pública. Consulte contratos em execução, potenciais clientes públicos e informação estruturada para apoiar a ação comercial.",
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
  duration?: string;
  status?: string;
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

function locationMatches(
  locations: string[],
  country: string,
  district: string,
  municipality: string
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



export default async function OutrosPage({
  searchParams,
}: {
  searchParams: Promise<MercadoSearchParams>;
}) {
  const params = await searchParams;
  const cpvFilter = (params.cpv ?? "").trim();
  const entityFilter = (params.entity ?? "").trim();
  const winnerFilter = (params.winner ?? "").trim();

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
  const durationFilter = (params.duration ?? "").trim();
  const statusFilter = (params.status ?? "").trim();
  const sortField = params.sort ?? "menos_proximo";
  const countryFilter = params.country ?? "all";
  const districtFilter = params.district ?? "all";
  const municipalityFilter = params.municipality ?? "all";

  const limitStr = (params.limit ?? "20").trim();
  const PAGE_SIZE = limitStr === "50" ? 50 : limitStr === "100" ? 100 : limitStr === "25" ? 25 : 20;

  const supabase = await createAdminClient();

  // Prefer the authenticated user's tenant (same behavior as dashboard).
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

  // Fetch all procedure/contract types to populate filters correctly
  const { data: procedureRows } = await supabase
    .from("contracts")
    .select("procedure_type")
    .eq("tenant_id", tenantId);

  const { data: contractTypeRows } = await supabase
    .from("contracts")
    .select("contract_type")
    .eq("tenant_id", tenantId);

  // Seed with standard types
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

  if (procedureRows) {
    procedureRows.forEach((r) => {
      if (r.procedure_type) procedureTypeSet.add(r.procedure_type);
    });
  }
  if (contractTypeRows) {
    contractTypeRows.forEach((r) => {
      if (r.contract_type) contractTypeSet.add(r.contract_type);
    });
  }

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
    (a, b) => a[0].localeCompare(b[0], "pt-PT")
  )) {
    locationOptionsByCountry[country] = {};

    for (const [district, municipalitySet] of Array.from(
      districtMap.entries()
    ).sort((a, b) => a[0].localeCompare(b[0], "pt-PT"))) {
      locationOptionsByCountry[country][district] = Array.from(
        municipalitySet
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
          (a, b) => a.localeCompare(b, "pt-PT")
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
          locationTree.get(selectedCountry)?.get(selectedDistrict) ?? []
        ).sort((a, b) => a.localeCompare(b, "pt-PT"))
      : [];

  const selectedMunicipality =
    selectedCountry !== "all" &&
    selectedDistrict !== "all" &&
    municipalityFilter !== "all" &&
    municipalityOptions.includes(municipalityFilter)
      ? municipalityFilter
      : "all";

  // Build the DB query to pull from the calculated view
  let q = supabase
    .from("mi_high_progress_contracts")
    .select(
      "id, object, procedure_type, contract_type, signing_date, publication_date, cpv_main, contract_price, base_price, status, contracting_entities, winners, execution_deadline_days, execution_locations, progress"
    )
    .eq("tenant_id", tenantId)
    .gte("progress", 0.75)
    .lte("progress", 1.0);

  // Apply DB-level filters
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

  // Apply DB-level sorting for optimal performance
  if (sortField === "menos_proximo") {
    q = q.order("progress", { ascending: true });
  } else {
    q = q.order("progress", { ascending: false });
  }

  // Fetch candidate contracts (limit to 10000 pre-filtered matches)
  const { data: contractsRaw } = await q.limit(10000);

  // Normalizer to ignore capitalization, spacing, accents, and punctuation
  function normalizeCompanyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/&amp;/g, "e")
      .replace(/&/g, "e")
      .replace(/[\.,\-\(\)\'\"]/g, "") // remove punctuation
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/\s+/g, " ") // normalize whitespace
      .trim();
  }

  // Extract NIF and name — suporta "NIF - Nome" e "NIF-ALIAS - Nome" (ex: "516165887-CTT - NOME")
  function extractNifAndCleanName(rawStr: string): { nif: string; cleanName: string } {
    const trimmed = rawStr.trim();
    const nifMatch = trimmed.match(/^(\d{5,12})/);
    const nif = nifMatch ? nifMatch[1] : "";
    const withoutNif = trimmed.replace(/^\d{5,12}/, "").replace(/^[-–\s]+/, "").trim();
    const cleanName = normalizeCompanyName(withoutNif || trimmed.replace(/^[-–\s\/\.]+/g, "").trim());
    return { nif, cleanName };
  }

  // Build lookup mapping of normalized company name -> NIF
  const companyNifLookup = new Map<string, string>();
  const entityNifLookup = new Map<string, string>();

  for (const c of contractsRaw ?? []) {
    if (Array.isArray(c.contracting_entities)) {
      for (const ent of c.contracting_entities) {
        if (typeof ent === "string") {
          const { nif, cleanName } = extractNifAndCleanName(ent);
          if (nif && cleanName) {
            entityNifLookup.set(cleanName, nif);
          }
        }
      }
    }
    if (Array.isArray(c.winners)) {
      for (const win of c.winners) {
        if (typeof win === "string") {
          const { nif, cleanName } = extractNifAndCleanName(win);
          if (nif && cleanName) {
            companyNifLookup.set(cleanName, nif);
          }
        }
      }
    }
  }

  // Enrich contracts missing NIFs
  const enrichedContractsRaw = (contractsRaw ?? []).map((c) => {
    const contracting_entities = Array.isArray(c.contracting_entities)
      ? c.contracting_entities.map((ent) => {
          if (typeof ent === "string") {
            const { nif, cleanName } = extractNifAndCleanName(ent);
            if (!nif && cleanName) {
              const resolvedNif = entityNifLookup.get(cleanName);
              if (resolvedNif) {
                const originalName = ent.replace(/^[\s\-\/\.]+/g, "").trim();
                return `${resolvedNif} - ${originalName}`;
              }
            }
          }
          return ent;
        })
      : c.contracting_entities;

    const winners = Array.isArray(c.winners)
      ? c.winners.map((win) => {
          if (typeof win === "string") {
            const { nif, cleanName } = extractNifAndCleanName(win);
            if (!nif && cleanName) {
              const resolvedNif = companyNifLookup.get(cleanName);
              if (resolvedNif) {
                const originalName = win.replace(/^[\s\-\/\.]+/g, "").trim();
                return `${resolvedNif} - ${originalName}`;
              }
            }
          }
          return win;
        })
      : c.winners;

    return {
      ...c,
      contracting_entities,
      winners,
    };
  });

  // Pre-fetch CPV descriptions on server side using admin client (bypasses RLS)
  const allCpvCodes = Array.from(
    new Set(
      enrichedContractsRaw
        .map((c) => c.cpv_main)
        .filter((code): code is string => typeof code === "string" && code.trim().length > 0)
    )
  );

  const cpvMap = new Map<string, string>();
  if (allCpvCodes.length > 0) {
    const { data: exactCpvData } = await supabase
      .from("cpv_codes")
      .select("id, descricao")
      .in("id", allCpvCodes);

    for (const row of exactCpvData ?? []) {
      if (row.id && row.descricao) {
        cpvMap.set(row.id, row.descricao);
      }
    }

    const missingCodes = allCpvCodes.filter((code) => !cpvMap.has(code));
    if (missingCodes.length > 0) {
      const prefixes = Array.from(
        new Set(
          missingCodes
            .map((c) => c.replace(/\D/g, "").slice(0, 8))
            .filter((p) => p.length >= 2)
        )
      );
      if (prefixes.length > 0) {
        const { data: prefixCpvData } = await supabase
          .from("cpv_codes")
          .select("id, descricao")
          .or(prefixes.map((p) => `id.ilike.${p}%`).join(","));

        for (const row of prefixCpvData ?? []) {
          if (!row.id || !row.descricao) continue;
          const cleanId = row.id.replace(/\D/g, "");
          for (const code of missingCodes) {
            const cleanCode = code.replace(/\D/g, "");
            if (cleanId.startsWith(cleanCode) || cleanCode.startsWith(cleanId)) {
              if (!cpvMap.has(code)) {
                cpvMap.set(code, row.descricao);
              }
            }
          }
        }
      }
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter in JS for progress >= 75%, locations, and closing_date range
  const contractsFiltered = enrichedContractsRaw
    .map((c: any) => {
      const signingDate = new Date(c.signing_date!);
      signingDate.setHours(0, 0, 0, 0);

      // Calcular diferença em dias
      const diffTime = Math.max(0, today.getTime() - signingDate.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      // Use progress from database view directly
      const progress = typeof c.progress === "number" ? c.progress : parseFloat(c.progress || "0");

      return {
        ...c,
        cpv_description: c.cpv_main ? cpvMap.get(c.cpv_main) ?? null : null,
        days_passed: diffDays,
        progress: progress,
        is_overdue: progress >= 1.0,
        execution_locations: toStringArray(c.execution_locations),
      };
    })
    .filter((c) => {
      // 1. Progress constraint (only >= 75% and <= 100%)
      if (c.progress < 0.75) return false;
      if (c.progress > 1.0) return false;

      // 2. Location filter
      const matchesLoc = locationMatches(
        c.execution_locations,
        selectedCountry,
        selectedDistrict,
        selectedMunicipality
      );
      if (!matchesLoc) return false;

      // 3. New Duration Filter
      if (durationFilter) {
        const days = c.execution_deadline_days || 0;
        if (durationFilter === "1_mes" && days > 30) return false;
        if (durationFilter === "6_meses" && days > 180) return false;
        if (durationFilter === "1_ano" && days > 365) return false;
        if (durationFilter === "2_anos" && days > 730) return false;
      }

      // 4. New Status Filter (Active / Unfinished)
      if (statusFilter === "active" && c.progress >= 1.0) {
        return false;
      }

      return true;
    });

  // Sort contracts
  const sortedContracts = [...contractsFiltered];
  if (sortField === "menos_proximo") {
    // Ascending progress (starts showing 75%, then 76%, etc.)
    sortedContracts.sort((a, b) => a.progress - b.progress);
  } else {
    // Default / "mais_proximo": Descending progress (starts showing closest to 100% or above)
    sortedContracts.sort((a, b) => b.progress - a.progress);
  }

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
    durationFilter ||
    statusFilter
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 overflow-x-hidden">
      <Header />

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-10 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-green-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                Market Intelligence
              </h1>
              <p className="text-gray-500 text-sm">
                Monitorização de contratos em fase de conclusão (
                {sortedContracts.length} contratos)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Filters Form - Same as Mercado Público */}
        <form className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <MercadoCpvInput defaultValue={cpvFilter} />
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="block text-xs text-gray-400">
                  Entidade adjudicante
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
                  Entidade adjudicatária
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
            <div>
              <MercadoMultiSelect
                name="procedure"
                label="Tipo de procedimento"
                options={procedureTypeOptions}
                defaultSelected={procedureFilters}
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <MercadoSingleSelect
                name="duration"
                label="Duração de contrato"
                defaultValue={durationFilter}
                options={[
                  { value: "", label: "Todos os contratos" },
                  { value: "1_mes", label: "Até 1 mês" },
                  { value: "6_meses", label: "Até 6 meses" },
                  { value: "1_ano", label: "Até 1 ano" },
                  { value: "2_anos", label: "Até 2 anos" },
                ]}
              />
            </div>

            <div>
              <MercadoSingleSelect
                name="status"
                label="Estado do contrato"
                defaultValue={statusFilter}
                options={[
                  { value: "", label: "Todos (≥ 75%)" },
                  { value: "active", label: "Ativos (Não terminados)" },
                ]}
              />
            </div>

            <div className="w-full">
              <label className="block text-xs text-gray-400 mb-1">
                Preço mínimo (€)
              </label>
              <PriceInput name="min_value" defaultValue={minValue} placeholder="0" />
            </div>

            <div className="w-full">
              <label className="block text-xs text-gray-400 mb-1">
                Preço máximo (€)
              </label>
              <PriceInput name="max_value" defaultValue={maxValue} placeholder="10000000" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_1.2fr_auto_auto] items-end gap-3">
            <MercadoLocationFilters
              locationOptionsByCountry={locationOptionsByCountry}
              defaultCountry={selectedCountry}
              defaultDistrict={selectedDistrict}
              defaultMunicipality={selectedMunicipality}
            />

            <MercadoSingleSelect
              name="limit"
              label="Apresentar"
              defaultValue={PAGE_SIZE.toString()}
              options={[
                { value: "20", label: "20 contratos" },
                { value: "50", label: "50 contratos" },
                { value: "100", label: "100 contratos" },
              ]}
            />

            <MercadoSingleSelect
              name="sort"
              label="Ordenar"
              defaultValue={sortField}
              options={[
                { value: "mais_proximo", label: "Mais próximo do fim" },
                { value: "menos_proximo", label: "Menos próximo do fim" },
              ]}
            />

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 px-5 py-2 rounded-xl text-sm font-medium text-white transition-all shadow-sm hover:opacity-90"
              style={{ background: "#3f6f27", color: "#ffffff" }}
            >
              <Filter className="w-4 h-4" />
              Pesquisar
            </button>
            {hasFilters && (
              <Link
                href="/outros"
                className="text-gray-500 text-sm font-medium px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-all"
              >
                Limpar
              </Link>
            )}
          </div>
        </form>

        <MarketIntelligenceTable
          contracts={sortedContracts as any}
          itemsPerPage={PAGE_SIZE}
        />

        <div className="mt-8 flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 leading-relaxed">
            <strong>Nota:</strong> Estes dados são calculados com base na data
            de assinatura e prazo de execução. Contratos sem estas informações
            básicas não são apresentados.
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
