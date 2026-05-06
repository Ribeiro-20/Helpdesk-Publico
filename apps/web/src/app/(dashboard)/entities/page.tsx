import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/layout/PageHeader";
import Link from "next/link";
import { Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const TYPE_BADGE: Record<string, string> = {
  "município": "bg-blue-50 text-blue-700",
  "freguesia": "bg-blue-50 text-blue-600",
  "ministério": "bg-purple-50 text-purple-700",
  "instituto": "bg-indigo-50 text-indigo-700",
  "saúde": "bg-red-50 text-red-700",
  "ensino": "bg-amber-50 text-amber-700",
  "empresa_publica": "bg-green-50 text-green-700",
  "autoridade": "bg-orange-50 text-orange-700",
  "defesa": "bg-gray-100 text-gray-700",
};

const TYPE_LABEL: Record<string, string> = {
  "município": "Município",
  "freguesia": "Freguesia",
  "ministério": "Ministério",
  "instituto": "Instituto",
  "saúde": "Saúde",
  "ensino": "Ensino",
  "empresa_publica": "Empresa Pública",
  "autoridade": "Autoridade",
  "defesa": "Defesa",
};

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

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    name?: string;
    type?: string;
    location?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const nameFilter = params.name ?? "";
  const typeFilter = params.type ?? "";
  const locationFilter = params.location ?? "";
  const sortField = params.sort ?? "total_value";

  const supabase = await createClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id")
    .maybeSingle();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Determine sort column and direction
  const sortOptions: Record<string, { column: string; ascending: boolean }> = {
    total_value: { column: "total_value", ascending: false },
    total_contracts: { column: "total_contracts", ascending: false },
    total_announcements: { column: "total_announcements", ascending: false },
    name: { column: "name", ascending: true },
  };
  const sort = sortOptions[sortField] ?? sortOptions.total_value;

  let q = supabase
    .from("entities")
    .select(
      "id, nif, name, entity_type, location, total_announcements, total_contracts, total_value, avg_contract_value",
      { count: "exact" },
    )
    .order(sort.column, { ascending: sort.ascending })
    .range(from, to);

  if (appUser?.tenant_id) q = q.eq("tenant_id", appUser.tenant_id);
  if (nameFilter) q = q.ilike("name", `%${nameFilter}%`);
  if (typeFilter) q = q.eq("entity_type", typeFilter);
  if (locationFilter) q = q.ilike("location", `%${locationFilter}%`);

  const { data: entities, count } = await q;
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  function buildQs(overrides: Record<string, string | number> = {}) {
    const base: Record<string, string> = {
      page: String(page),
      name: nameFilter,
      type: typeFilter,
      location: locationFilter,
      sort: sortField,
    };
    const merged = { ...base, ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])) };
    const parts = Object.entries(merged).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    return `/entities?${parts.join("&")}`;
  }

  const hasFilters = nameFilter || typeFilter || locationFilter;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Building2}
        title="Entidades Públicas"
        description={`${count ?? 0} entidades adjudicantes`}
      />

      {/* Filters */}
      <form className="bg-white border border-surface-200 rounded-xl p-4 shadow-card space-y-3">
        <div className="flex flex-wrap gap-3">
          <input
            name="name"
            defaultValue={nameFilter}
            placeholder="Nome ou NIPC..."
            className="border border-surface-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all w-52"
          />
          <select
            name="type"
            defaultValue={typeFilter}
            className="border border-surface-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all bg-white"
          >
            <option value="">Todos os tipos</option>
            {Object.entries(TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
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
            <option value="total_value">Maior valor</option>
            <option value="total_contracts">Mais contratos</option>
            <option value="total_announcements">Mais anúncios</option>
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
              href="/entities"
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
                  Entidade
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Tipo
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Localização
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Anúncios
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Contratos
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Valor Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {(entities ?? []).map((ent) => (
                <tr key={ent.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3 max-w-xs">
                    <Link
                      href={`/entities/${ent.id}`}
                      className="text-brand-600 hover:underline font-medium line-clamp-2"
                    >
                      {ent.name}
                    </Link>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{ent.nif}</p>
                  </td>
                  <td className="px-4 py-3">
                    {ent.entity_type ? (
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[ent.entity_type] ?? "bg-gray-100 text-gray-600"}`}>
                        {TYPE_LABEL[ent.entity_type] ?? ent.entity_type}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[160px] truncate">
                    {ent.location ?? "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium tabular-nums">
                    {ent.total_announcements > 0 ? ent.total_announcements : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium tabular-nums">
                    {ent.total_contracts > 0 ? ent.total_contracts : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium whitespace-nowrap">
                    {formatEur(ent.total_value)}
                  </td>
                </tr>
              ))}
              {(entities ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    {hasFilters
                      ? "Nenhuma entidade encontrada com estes filtros"
                      : "Nenhuma entidade na base de dados. Execute \"Extrair Entidades\" nas Definições."}
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
