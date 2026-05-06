import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/layout/PageHeader";
import Link from "next/link";
import { Factory } from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function formatEur(val: number | null): string {
  if (val == null || val === 0) return "\u2014";
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M \u20AC`;
  }
  if (val >= 1_000) {
    return `${(val / 1_000).toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k \u20AC`;
  }
  return `${val.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} \u20AC`;
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    name?: string;
    location?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const nameFilter = params.name ?? "";
  const locationFilter = params.location ?? "";
  const sortField = params.sort ?? "total_value_won";

  const supabase = await createClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id")
    .maybeSingle();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const sortOptions: Record<string, { column: string; ascending: boolean }> = {
    total_value_won: { column: "total_value_won", ascending: false },
    contracts_won: { column: "contracts_won", ascending: false },
    win_rate: { column: "win_rate", ascending: false },
    name: { column: "name", ascending: true },
  };
  const sort = sortOptions[sortField] ?? sortOptions.total_value_won;

  let q = supabase
    .from("companies")
    .select(
      "id, nif, name, location, contracts_won, contracts_participated, total_value_won, avg_contract_value, win_rate",
      { count: "exact" },
    )
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .range(from, to);

  if (appUser?.tenant_id) q = q.eq("tenant_id", appUser.tenant_id);
  if (nameFilter) q = q.ilike("name", `%${nameFilter}%`);
  if (locationFilter) q = q.ilike("location", `%${locationFilter}%`);

  const { data: companies, count } = await q;
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  function buildQs(overrides: Record<string, string | number> = {}) {
    const base: Record<string, string> = {
      page: String(page),
      name: nameFilter,
      location: locationFilter,
      sort: sortField,
    };
    const merged = { ...base, ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])) };
    const parts = Object.entries(merged).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    return `/companies?${parts.join("&")}`;
  }

  const hasFilters = nameFilter || locationFilter;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Factory}
        title="Empresas"
        description={`${count ?? 0} empresas adjudicatárias`}
      />

      {/* Filters */}
      <form className="bg-white border border-surface-200 rounded-xl p-4 shadow-card">
        <div className="flex flex-wrap gap-3">
          <input
            name="name"
            defaultValue={nameFilter}
            placeholder="Nome ou NIPC..."
            className="border border-surface-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all w-52"
          />
          <input
            name="location"
            defaultValue={locationFilter}
            placeholder="Localização..."
            className="border border-surface-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all w-44"
          />
          <select
            name="sort"
            defaultValue={sortField}
            className="border border-surface-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all bg-white"
          >
            <option value="total_value_won">Maior valor</option>
            <option value="contracts_won">Mais contratos</option>
            <option value="win_rate">Maior taxa vitória</option>
            <option value="name">Nome (A-Z)</option>
          </select>
          <button
            type="submit"
            className="bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-brand-700 transition-all shadow-sm hover:shadow-md"
          >
            Filtrar
          </button>
          {hasFilters && (
            <Link
              href="/companies"
              className="text-gray-500 text-sm font-medium px-4 py-2 rounded-xl bg-white border border-surface-200 hover:bg-surface-50 transition-all shadow-card"
            >
              Limpar
            </Link>
          )}
        </div>
      </form>

      {/* Table */}
      <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Empresa
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Localização
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Ganhos
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Participações
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Taxa Vitória
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Valor Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {(companies ?? []).map((comp) => (
                <tr key={comp.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3 max-w-xs">
                    <Link
                      href={`/companies/${comp.id}`}
                      className="text-brand-600 hover:underline font-medium line-clamp-2"
                    >
                      {comp.name}
                    </Link>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{comp.nif}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[160px] truncate">
                    {comp.location ?? "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium tabular-nums">
                    {comp.contracts_won > 0 ? comp.contracts_won : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                    {comp.contracts_participated > 0 ? comp.contracts_participated : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {comp.win_rate != null ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        comp.win_rate >= 50
                          ? "bg-green-50 text-green-700"
                          : comp.win_rate >= 25
                          ? "bg-amber-50 text-amber-700"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {Number(comp.win_rate).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium whitespace-nowrap">
                    {formatEur(comp.total_value_won)}
                  </td>
                </tr>
              ))}
              {(companies ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    {hasFilters
                      ? "Nenhuma empresa encontrada com estes filtros"
                      : "Nenhuma empresa na base de dados. Execute \"Extrair Empresas\" nas Definições."}
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
