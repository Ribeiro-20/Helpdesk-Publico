import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { FileText } from "lucide-react";
import Header from "@/components/layout/Header";
import ContractsTable, { type ContractRow } from "@/components/ContractsTable";
import MercadoCpvInput from "@/components/MercadoCpvInput";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const NAV_BG = "rgba(26, 27, 31, 1)";

const FOOTER_COLS: Record<string, string[]> = {
  SERVIÇOS: [
    "Serviços Adjudicantes",
    "Serviços Empresas e Adjudicatários",
    "Alerta Concursos Públicos",
    "Identificação CPV",
  ],
  RECURSOS: ["Blog", "ESG e Sustentabilidade", "RH", "FAQs"],
  INSTITUCIONAL: ["Sobre Nós"],
};

type MercadoSearchParams = {
  page?: string;
  cpv?: string;
  entity?: string;
  winner?: string;
  procedure?: string;
  contract_type?: string;
  country?: string;
  district?: string;
  municipality?: string;
  min_value?: string;
  max_value?: string;
  from_date?: string;
  to_date?: string;
  sort?: string;
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
    if (municipality !== "all" && parsed.municipality !== municipality) continue;

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
  const procedureFilter = (params.procedure ?? "").trim();
  const minValue = (params.min_value ?? "").trim();
  const maxValue = (params.max_value ?? "").trim();
  const fromDate = (params.from_date ?? "").trim();
  const toDate = (params.to_date ?? "").trim();
  const sortField = params.sort ?? "signing_date";
  const contractTypeFilter = params.contract_type ?? "all";
  const countryFilter = params.country ?? "all";
  const districtFilter = params.district ?? "all";
  const municipalityFilter = params.municipality ?? "all";

  const supabase = await createClient();

  // Get first tenant (public access — no auth required)
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();

  const tenantId = tenant?.id ?? "00000000-0000-0000-0000-000000000000";

  // Build facet options for contract type and hierarchical location filters.
  const { data: facetRows } = await supabase
    .from("contracts")
    .select("contract_type, execution_locations")
    .eq("tenant_id", tenantId)
    .limit(5000);

  const contractTypeSet = new Set<string>();
  const locationTree = new Map<string, Map<string, Set<string>>>();

  for (const row of facetRows ?? []) {
    const contractType = (row.contract_type as string | null) ?? null;
    if (contractType) {
      contractTypeSet.add(contractType);
    }

    for (const rawLocation of toStringArray(row.execution_locations)) {
      const { country, district, municipality } = parseExecutionLocation(rawLocation);
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

  const contractTypeOptions = Array.from(contractTypeSet).sort((a, b) =>
    a.localeCompare(b, "pt-PT"),
  );

  const countryOptions = Array.from(locationTree.keys()).sort((a, b) =>
    a.localeCompare(b, "pt-PT"),
  );
  const selectedCountry =
    countryFilter !== "all" && countryOptions.includes(countryFilter)
      ? countryFilter
      : "all";

  const districtSet = new Set<string>();
  if (selectedCountry !== "all") {
    for (const district of Array.from(locationTree.get(selectedCountry)?.keys() ?? [])) {
      districtSet.add(district);
    }
  } else {
    for (const countryMap of Array.from(locationTree.values())) {
      for (const district of Array.from(countryMap.keys())) {
        districtSet.add(district);
      }
    }
  }

  const districtOptions = Array.from(districtSet).sort((a, b) =>
    a.localeCompare(b, "pt-PT"),
  );
  const selectedDistrict =
    districtFilter !== "all" && districtOptions.includes(districtFilter)
      ? districtFilter
      : "all";

  const municipalitySet = new Set<string>();
  if (selectedCountry !== "all" && selectedDistrict !== "all") {
    for (const municipality of Array.from(
      locationTree.get(selectedCountry)?.get(selectedDistrict) ?? [],
    )) {
      municipalitySet.add(municipality);
    }
  } else if (selectedCountry !== "all") {
    for (const districtMap of Array.from(locationTree.get(selectedCountry)?.values() ?? [])) {
      for (const municipality of Array.from(districtMap)) {
        municipalitySet.add(municipality);
      }
    }
  } else if (selectedDistrict !== "all") {
    for (const countryMap of Array.from(locationTree.values())) {
      for (const [district, municipalityList] of Array.from(countryMap.entries())) {
        if (district !== selectedDistrict) continue;
        for (const municipality of Array.from(municipalityList)) {
          municipalitySet.add(municipality);
        }
      }
    }
  } else {
    for (const countryMap of Array.from(locationTree.values())) {
      for (const municipalityList of Array.from(countryMap.values())) {
        for (const municipality of Array.from(municipalityList)) {
          municipalitySet.add(municipality);
        }
      }
    }
  }

  const municipalityOptions = Array.from(municipalitySet).sort((a, b) =>
    a.localeCompare(b, "pt-PT"),
  );
  const selectedMunicipality =
    municipalityFilter !== "all" && municipalityOptions.includes(municipalityFilter)
      ? municipalityFilter
      : "all";

  const selectedContractType =
    contractTypeFilter !== "all" && contractTypeOptions.includes(contractTypeFilter)
      ? contractTypeFilter
      : "all";

  const needsExtendedFiltering =
    !!cpvFilter ||
    selectedContractType !== "all" ||
    selectedCountry !== "all" ||
    selectedDistrict !== "all" ||
    selectedMunicipality !== "all";

  const rpcOffset = needsExtendedFiltering ? 0 : (page - 1) * PAGE_SIZE;
  const rpcLimit = needsExtendedFiltering ? 5000 : PAGE_SIZE;

  let totalCount = 0;
  let contracts: ContractRow[] = [];

  const { data: rpcResult } = await supabase.rpc("search_contracts", {
    p_tenant_id: tenantId,
    p_entity_nif: entityFilter || null,
    p_winner_nif: winnerFilter || null,
    p_cpv: cpvFilter || null,
    p_procedure: procedureFilter || null,
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
    const result = rpcResult[0] as { rows: ContractRow[]; total_count: number };
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
      .select("id, contract_type, execution_deadline_days, execution_locations")
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

  if (cpvFilter) {
    const cpvPrefix = cpvFilter.toLowerCase();
    mergedRows = mergedRows.filter((row) =>
      (row.cpv_main ?? "").toLowerCase().startsWith(cpvPrefix),
    );
  }

  if (selectedContractType !== "all") {
    mergedRows = mergedRows.filter(
      (row) => (row.contract_type ?? "") === selectedContractType,
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

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const hasFilters = !!(
    cpvFilter ||
    entityFilter ||
    winnerFilter ||
    procedureFilter ||
    selectedContractType !== "all" ||
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
  if (procedureFilter) qsParams.set("procedure", procedureFilter);
  if (selectedContractType !== "all") qsParams.set("contract_type", selectedContractType);
  if (selectedCountry !== "all") qsParams.set("country", selectedCountry);
  if (selectedDistrict !== "all") qsParams.set("district", selectedDistrict);
  if (selectedMunicipality !== "all") qsParams.set("municipality", selectedMunicipality);
  if (minValue) qsParams.set("min_value", minValue);
  if (maxValue) qsParams.set("max_value", maxValue);
  if (fromDate) qsParams.set("from_date", fromDate);
  if (toDate) qsParams.set("to_date", toDate);
  if (sortField) qsParams.set("sort", sortField);
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
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-10 space-y-6">
        {/* Title */}
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-green-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Mercado Público
            </h1>
            <p className="text-gray-500 text-sm">
              {totalCount} contratos celebrados
            </p>
          </div>
        </div>

        {/* Filters */}
        <form className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <MercadoCpvInput defaultValue={cpvFilter} />
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Entidade adjudicante
              </label>
              <input
                name="entity"
                defaultValue={entityFilter}
                placeholder="Nome ou NIPC"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Empresa adjudicatária
              </label>
              <input
                name="winner"
                defaultValue={winnerFilter}
                placeholder="Nome ou NIPC"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Tipo de procedimento
              </label>
              <input
                name="procedure"
                defaultValue={procedureFilter}
                placeholder="Concurso Publico, Ajuste Direto..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Tipo de contrato
              </label>
              <select
                name="contract_type"
                defaultValue={selectedContractType}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
              >
                <option value="all">Todos</option>
                {contractTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Data de
              </label>
              <input
                name="from_date"
                type="date"
                defaultValue={fromDate}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Data até
              </label>
              <input
                name="to_date"
                type="date"
                defaultValue={toDate}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Valor min.
              </label>
              <input
                name="min_value"
                type="number"
                defaultValue={minValue}
                placeholder="0"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Valor max.
              </label>
              <input
                name="max_value"
                type="number"
                defaultValue={maxValue}
                placeholder="10000000"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1.2fr_auto_auto] items-end gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                País
              </label>
              <select
                name="country"
                defaultValue={selectedCountry}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
              >
                <option value="all">Todos</option>
                {countryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Distrito
              </label>
              <select
                name="district"
                defaultValue={selectedDistrict}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all bg-white w-full"
              >
                <option value="all">Todos</option>
                {districtOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Concelho
              </label>
              <select
                name="municipality"
                defaultValue={selectedMunicipality}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all bg-white w-full"
              >
                <option value="all">Todos</option>
                {municipalityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Ordenar
              </label>
              <select
                name="sort"
                defaultValue={sortField}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all bg-white w-full"
              >
                <option value="signing_date">Mais recentes</option>
                <option value="publication_date">Data publicação</option>
                <option value="value_desc">Maior valor</option>
                <option value="value_asc">Menor valor</option>
              </select>
            </div>

            <button
              type="submit"
              className="text-white text-sm font-medium px-5 py-2 rounded-xl transition-all shadow-sm hover:opacity-90"
              style={{ background: "rgba(74, 222, 128, 1)", color: "#1a1a1a" }}
            >
              Filtrar
            </button>
            {hasFilters && (
              <Link
                href="/mercado-publico"
                className="text-gray-500 text-sm font-medium px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-all"
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
      <footer
        className="text-white pt-12 pb-6 px-10"
        style={{ background: NAV_BG }}
      >
        <div className="max-w-screen-2xl mx-auto">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_80px] gap-16 pb-10 border-b border-white/10">
            <div className="flex flex-col gap-4 pr-8">
              <Image
                src="/logo-white.webp"
                alt="Helpdesk Público"
                width={180}
                height={60}
                className="object-contain"
              />
              <p className="text-sm text-gray-400 leading-relaxed">
                Soluções especializadas em Contratação Pública Eficiente.
                Apoiamos entidades adjudicantes e operadores económicos em todo
                o processo de concurso público.
              </p>
            </div>
            {Object.entries(FOOTER_COLS).map(([title, links]) => (
              <div key={title}>
                <p className="text-sm font-bold tracking-widest uppercase text-white mb-4">
                  {title}
                </p>
                <ul className="space-y-2.5">
                  {links.map((label) => (
                    <li key={label}>
                      <Link
                        href="#"
                        className={`text-sm text-gray-400 hover:text-white transition-colors ${label === "Serviços Empresas e Adjudicatários" ? "underline" : ""}`}
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="flex flex-col items-center gap-4 pt-1">
              <a
                href="mailto:supcom@helpdeskpublico.pt"
                aria-label="Email"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </a>
              <button
                aria-label="Conta"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M20 21a8 8 0 1 0-16 0" />
                </svg>
              </button>
            </div>
          </div>
          <div className="pt-5 flex items-center justify-between text-xs text-gray-500">
            <p>
              © 2023 Helpdesk Público. Todos os direitos reservados. Contratação
              Pública Eficiente.
            </p>
            <div className="flex items-center gap-5">
              <Link href="#" className="hover:text-gray-300 transition-colors">
                Política de Privacidade
              </Link>
              <Link href="#" className="hover:text-gray-300 transition-colors">
                Termos de Utilização
              </Link>
              <Link href="#" className="hover:text-gray-300 transition-colors">
                Cookies
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
