import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { FileText } from "lucide-react";
import Header from "@/components/layout/Header";
import ContractsTable from "@/components/ContractsTable";

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

export default async function MercadoPublicoPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    cpv?: string;
    entity?: string;
    winner?: string;
    procedure?: string;
    min_value?: string;
    max_value?: string;
    from_date?: string;
    to_date?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const cpvFilter = params.cpv ?? "";
  const entityFilter = params.entity ?? "";
  const winnerFilter = params.winner ?? "";
  const procedureFilter = params.procedure ?? "";
  const minValue = params.min_value ?? "";
  const maxValue = params.max_value ?? "";
  const fromDate = params.from_date ?? "";
  const toDate = params.to_date ?? "";
  const sortField = params.sort ?? "signing_date";

  const supabase = await createClient();

  // Get first tenant (public access — no auth required)
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();

  const tenantId = tenant?.id ?? "00000000-0000-0000-0000-000000000000";
  const from = (page - 1) * PAGE_SIZE;

  interface ContractRow {
    id: string;
    object: string | null;
    procedure_type: string | null;
    publication_date: string | null;
    signing_date: string | null;
    cpv_main: string | null;
    contract_price: number | null;
    base_price: number | null;
    effective_price: number | null;
    currency: string;
    status: string;
    contracting_entities: string[];
    winners: string[];
  }

  let contracts: ContractRow[] = [];
  let totalCount = 0;

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
    p_offset: from,
    p_limit: PAGE_SIZE,
  });

  if (rpcResult && Array.isArray(rpcResult) && rpcResult.length > 0) {
    const result = rpcResult[0] as { rows: ContractRow[]; total_count: number };
    contracts = Array.isArray(result.rows) ? result.rows : [];
    totalCount = result.total_count ?? 0;
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasFilters = !!(
    cpvFilter ||
    entityFilter ||
    winnerFilter ||
    procedureFilter ||
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
  if (minValue) qsParams.set("min_value", minValue);
  if (maxValue) qsParams.set("max_value", maxValue);
  if (fromDate) qsParams.set("from_date", fromDate);
  if (toDate) qsParams.set("to_date", toDate);
  if (sortField) qsParams.set("sort", sortField);
  const buildQsBase = `/mercado-publico?${qsParams.toString()}`;

  function buildQs(overrides: Record<string, string | number> = {}) {
    const base: Record<string, string> = {
      page: String(page),
      cpv: cpvFilter,
      entity: entityFilter,
      winner: winnerFilter,
      procedure: procedureFilter,
      min_value: minValue,
      max_value: maxValue,
      from_date: fromDate,
      to_date: toDate,
      sort: sortField,
    };
    const merged = {
      ...base,
      ...Object.fromEntries(
        Object.entries(overrides).map(([k, v]) => [k, String(v)]),
      ),
    };
    const parts = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    return `/mercado-publico?${parts.join("&")}`;
  }

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
          <div className="grid grid-cols-4 gap-3">
            <input
              name="cpv"
              defaultValue={cpvFilter}
              placeholder="CPV (ex: 45000000)"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
            />
            <input
              name="entity"
              defaultValue={entityFilter}
              placeholder="Entidade..."
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
            />
            <input
              name="winner"
              defaultValue={winnerFilter}
              placeholder="Empresa vencedora..."
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
            />
            <input
              name="procedure"
              defaultValue={procedureFilter}
              placeholder="Tipo procedimento..."
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
            />
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.4fr_auto_auto] items-end gap-3">
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
          page={page}
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
              <button
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
              </button>
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
