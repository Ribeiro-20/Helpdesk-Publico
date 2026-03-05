import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { effectiveStatus, STATUS_BADGE, STATUS_LABEL } from "@/lib/announcements";

const PAGE_SIZE = 20;

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; cpv?: string; entity?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const cpvFilter = params.cpv ?? "";
  const entityFilter = params.entity ?? "";

  const supabase = await createClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("tenant_id")
    .maybeSingle();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("announcements")
    .select(
      "id, title, entity_name, publication_date, cpv_main, base_price, currency, status, proposal_deadline_at",
      { count: "exact" },
    )
    .order("publication_date", { ascending: false })
    .range(from, to);

  if (appUser?.tenant_id) query = query.eq("tenant_id", appUser.tenant_id);
  if (cpvFilter) query = query.ilike("cpv_main", `%${cpvFilter}%`);
  if (entityFilter) query = query.ilike("entity_name", `%${entityFilter}%`);

  const { data: announcements, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  const now = new Date();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Anúncios</h1>
        <p className="text-gray-500 text-sm mt-0.5">{count ?? 0} anúncios</p>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3 bg-white border border-surface-200 rounded-xl p-4 shadow-card">
        <input
          name="cpv"
          defaultValue={cpvFilter}
          placeholder="CPV (ex: 71240000-2)"
          className="border border-surface-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all w-48"
        />
        <input
          name="entity"
          defaultValue={entityFilter}
          placeholder="Entidade..."
          className="border border-surface-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all w-52"
        />
        <button
          type="submit"
          className="bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-brand-700 transition-all shadow-sm hover:shadow-md"
        >
          Filtrar
        </button>
        {(cpvFilter || entityFilter) && (
          <Link
            href="/announcements"
            className="text-gray-500 text-sm font-medium px-4 py-2 rounded-xl bg-white border border-surface-200 hover:bg-surface-50 transition-all shadow-card"
          >
            Limpar
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Titulo
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Entidade
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Data
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  CPV
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Preco Base
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {(announcements ?? []).map((ann) => {
                const s = effectiveStatus(ann, now);
                return (
                  <tr key={ann.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <Link
                        href={`/announcements/${ann.id}`}
                        className="text-brand-600 hover:underline font-medium line-clamp-2"
                      >
                        {ann.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">
                      {ann.entity_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {ann.publication_date}
                    </td>
                    <td className="px-4 py-3">
                      {ann.cpv_main ? (
                        <span className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono whitespace-nowrap">
                          {ann.cpv_main}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium whitespace-nowrap">
                      {ann.base_price != null
                        ? `${Number(ann.base_price).toLocaleString("pt-PT")} ${ann.currency}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[s] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {STATUS_LABEL[s] ?? s}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(announcements ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    Nenhum anúncio encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (() => {
        const qs = (p: number) =>
          `/announcements?page=${p}&cpv=${cpvFilter}&entity=${entityFilter}`;
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
              <Link href={qs(page - 1)} className={BTN}>← Anterior</Link>
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
              <Link href={qs(page + 1)} className={BTN}>Próxima →</Link>
            )}
          </div>
        );
      })()}
    </div>
  );
}
