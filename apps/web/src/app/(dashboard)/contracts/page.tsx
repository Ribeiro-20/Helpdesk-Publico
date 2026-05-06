import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/layout/PageHeader";
import SingleDatePicker from "@/components/SingleDatePicker";
import Link from "next/link";
import { FileSignature } from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
  modified: "bg-amber-100 text-amber-700",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  closed: "Fechado",
  modified: "Modificado",
};

function formatEur(val: number | null): string {
  if (val == null) return "\u2014";
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M \u20AC`;
  }
  if (val >= 1_000) {
    return `${(val / 1_000).toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k \u20AC`;
  }
  return val.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " \u20AC";
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function discountBadge(base: number | null, contract: number | null) {
  if (base == null || contract == null || base === 0) return null;
  const pct = ((base - contract) / base) * 100;
  if (Math.abs(pct) < 0.5) return null;
  const isDiscount = pct > 0;
  return (
    <span
      className={`inline-block text-xs px-1.5 py-0.5 rounded font-medium ${
        isDiscount ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
      }`}
    >
      {isDiscount ? "-" : "+"}{Math.abs(pct).toFixed(0)}%
    </span>
  );
}

/** Extract display name from contract party payloads (string or object). */
function extractName(raw: unknown): string {
  if (typeof raw === "string") {
    const idx = raw.indexOf(" - ");
    return idx === -1 ? raw : raw.slice(idx + 3);
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const directName = record.name;
    if (typeof directName === "string" && directName.trim()) {
      return directName;
    }

    const nif = record.nif;
    const full = record.value ?? record.label ?? record.text;
    if (typeof full === "string" && full.trim()) {
      const idx = full.indexOf(" - ");
      if (idx !== -1) return full.slice(idx + 3);
      if (typeof nif === "string" && full.startsWith(`${nif} `)) {
        return full.slice(nif.length).trim();
      }
      return full;
    }
  }

  return "\u2014";
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    cpv?: string;
    entity?: string;
    entity_nif?: string;
    winner?: string;
    winner_nif?: string;
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
  const entityNifFilter = params.entity_nif ?? "";
  const winnerFilter = params.winner ?? "";
  const winnerNifFilter = params.winner_nif ?? "";
  const procedureFilter = params.procedure ?? "";
  const minValue = params.min_value ?? "";
  const maxValue = params.max_value ?? "";
  const fromDate = params.from_date ?? "";
  const toDate = params.to_date ?? "";
  const sortField = params.sort ?? "signing_date";

  const supabase = await createClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id")
    .maybeSingle();

  const from = (page - 1) * PAGE_SIZE;

  // Use search_contracts RPC for JSONB-aware filtering
  const hasNifFilter = entityNifFilter || winnerNifFilter;
  const hasAnyFilter = cpvFilter || entityFilter || entityNifFilter || winnerFilter || winnerNifFilter || procedureFilter || minValue || maxValue || fromDate || toDate;

  // Combine entity text filter with NIF: if user typed entity name, search in JSONB text;
  // if coming from entity detail page, use NIF.
  // The RPC handles both entity_nif and winner_nif via text cast.
  const effectiveEntityNif = entityNifFilter || (entityFilter ? entityFilter : null);
  const effectiveWinnerNif = winnerNifFilter || (winnerFilter ? winnerFilter : null);

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
    contracting_entities: unknown[];
    winners: unknown[];
  }

  let contracts: ContractRow[] = [];
  let totalCount = 0;

  const { data: rpcResult } = await supabase.rpc("search_contracts", {
    p_tenant_id: appUser?.tenant_id ?? "00000000-0000-0000-0000-000000000000",
    p_entity_nif: effectiveEntityNif,
    p_winner_nif: effectiveWinnerNif,
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

  // Build query string helper
  function buildQs(overrides: Record<string, string | number> = {}) {
    const base: Record<string, string> = {
      page: String(page),
      cpv: cpvFilter,
      entity: entityFilter,
      entity_nif: entityNifFilter,
      winner: winnerFilter,
      winner_nif: winnerNifFilter,
      procedure: procedureFilter,
      min_value: minValue,
      max_value: maxValue,
      from_date: fromDate,
      to_date: toDate,
      sort: sortField,
    };
    const merged = { ...base, ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])) };
    const parts = Object.entries(merged).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    return `/contracts?${parts.join("&")}`;
  }

  const hasFilters = hasAnyFilter;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileSignature}
        title="Contratos"
        description={`${totalCount} contratos celebrados`}
      />

      {/* Active NIF filter banner */}
      {(entityNifFilter || winnerNifFilter) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-blue-700">
            {entityNifFilter && <>A filtrar por entidade NIF <span className="font-mono font-medium">{entityNifFilter}</span></>}
            {entityNifFilter && winnerNifFilter && <> &middot; </>}
            {winnerNifFilter && <>A filtrar por vencedor NIF <span className="font-mono font-medium">{winnerNifFilter}</span></>}
            {" "}&mdash; {totalCount} resultado{totalCount !== 1 ? "s" : ""}
          </p>
          <Link href="/contracts" className="text-blue-600 hover:underline text-sm font-medium">
            Limpar filtro
          </Link>
        </div>
      )}

      {/* Filters */}
      <form className="bg-white border border-surface-200 rounded-2xl p-4 md:p-5 shadow-card space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            name="cpv"
            defaultValue={cpvFilter}
            placeholder="CPV (ex: 45000000)"
            className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
          />
          <input
            name="entity"
            defaultValue={entityFilter}
            placeholder="Entidade..."
            className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
          />
          <input
            name="winner"
            defaultValue={winnerFilter}
            placeholder="Empresa vencedora..."
            className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
          />
          <input
            name="procedure"
            defaultValue={procedureFilter}
            placeholder="Tipo procedimento..."
            className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 rounded-xl border border-surface-100 bg-surface-50/60 p-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Data de</label>
            <SingleDatePicker
              name="from_date"
              defaultValue={fromDate}
              placeholder="Data início"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Data até</label>
            <SingleDatePicker
              name="to_date"
              defaultValue={toDate}
              placeholder="Data fim"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Valor min.</label>
            <input
              name="min_value"
              type="number"
              defaultValue={minValue}
              placeholder="0"
              className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Valor max.</label>
            <input
              name="max_value"
              type="number"
              defaultValue={maxValue}
              placeholder="10000000"
              className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Ordenar</label>
            <select
              name="sort"
              defaultValue={sortField}
              className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all bg-white"
            >
              <option value="signing_date">Mais recentes</option>
              <option value="publication_date">Data publicação</option>
              <option value="value_desc">Maior valor</option>
              <option value="value_asc">Menor valor</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="w-full bg-brand-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-brand-700 transition-all shadow-sm hover:shadow-md"
            >
              Filtrar
            </button>
            {hasFilters && (
              <Link
                href="/contracts"
                className="shrink-0 text-gray-500 text-sm font-medium px-4 py-2.5 rounded-xl bg-white border border-surface-200 hover:bg-surface-50 transition-all shadow-card"
              >
                Limpar
              </Link>
            )}
          </div>
        </div>
      </form>

      {/* Table */}
      <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Objecto
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Entidade
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Vencedor
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Celebração
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  CPV
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Valor
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {contracts.map((c) => {
                const entityName = Array.isArray(c.contracting_entities) && c.contracting_entities.length > 0
                  ? extractName(c.contracting_entities[0])
                  : "\u2014";
                const winnerName = Array.isArray(c.winners) && c.winners.length > 0
                  ? extractName(c.winners[0])
                  : "\u2014";

                return (
                  <tr key={c.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <Link
                        href={`/contracts/${c.id}`}
                        className="text-brand-600 hover:underline font-medium line-clamp-2"
                      >
                        {c.object || "Sem objecto"}
                      </Link>
                      {c.procedure_type && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{c.procedure_type}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate text-xs">
                      {entityName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate text-xs">
                      {winnerName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs tabular-nums">
                      {formatDate(c.signing_date)}
                    </td>
                    <td className="px-4 py-3">
                      {c.cpv_main ? (
                        <span className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono whitespace-nowrap">
                          {c.cpv_main}
                        </span>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="text-gray-900 font-medium text-xs">
                        {formatEur(c.contract_price)}
                      </span>
                      {discountBadge(c.base_price, c.contract_price) && (
                        <span className="ml-1.5">
                          {discountBadge(c.base_price, c.contract_price)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[c.status] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {contracts.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    {hasFilters
                      ? "Nenhum contrato encontrado com estes filtros"
                      : "Nenhum contrato na base de dados. Execute a ingest\u00E3o de contratos no Dashboard."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (() => {
        const qs = (p: number) => buildQs({ page: p });
        const BTN = "px-3 py-1.5 text-sm font-medium bg-white border border-surface-200 rounded-xl hover:bg-surface-50 transition-all shadow-card";
        const ACTIVE = "px-3 py-1.5 text-sm font-medium rounded-xl bg-brand-600 text-white shadow-sm";
        const DOTS = "px-2 py-1.5 text-sm text-gray-300";

        const pages: (number | "dots")[] = [];
        const add = (n: number) => { if (!pages.includes(n)) pages.push(n); };

        add(1);
        if (page > 3) pages.push("dots");
        for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) add(i);
        if (page < totalPages - 2) pages.push("dots");
        if (totalPages > 1) add(totalPages);

        return (
          <div className="flex justify-center items-center gap-1 flex-wrap">
            {page > 1 && (
              <Link href={qs(page - 1)} className={BTN}>&larr; Anterior</Link>
            )}
            {pages.map((p, i) =>
              p === "dots" ? (
                <span key={`dots-${i}`} className={DOTS}>...</span>
              ) : (
                <Link key={p} href={qs(p)} className={p === page ? ACTIVE : BTN}>
                  {p}
                </Link>
              ),
            )}
            {page < totalPages && (
              <Link href={qs(page + 1)} className={BTN}>Pr&oacute;xima &rarr;</Link>
            )}
          </div>
        );
      })()}
    </div>
  );
}
