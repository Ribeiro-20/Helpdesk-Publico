import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/layout/PageHeader";
import SingleDatePicker from "@/components/SingleDatePicker";
import Link from "next/link";
import { Megaphone, ArrowUp, ArrowDown, ArrowUpDown, FileSpreadsheet } from "lucide-react";
import { effectiveStatus, STATUS_BADGE, STATUS_LABEL } from "@/lib/announcements";

const PAGE_SIZE = 20;

const SORTABLE: Record<string, string> = {
  publication_date: "publication_date",
  base_price: "base_price",
  entity_name: "entity_name",
  title: "title",
  status: "proposal_deadline_at",
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function cpvCore8(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : "";
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
    cpv?: string;
    entity?: string;
    source?: string;
    status?: string;
    from_date?: string;
    to_date?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const pageRaw = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const cpvFilter = params.cpv ?? "";
  const entityFilter = params.entity ?? "";
  const sourceFilter = params.source ?? "";
  const statusFilter = params.status ?? "";
  const fromDateRaw = params.from_date ?? "";
  const toDateRaw = params.to_date ?? "";
  const fromDateFilter = isIsoDate(fromDateRaw) ? fromDateRaw : "";
  const toDateFilter = isIsoDate(toDateRaw) ? toDateRaw : "";
  const [dateFrom, dateTo] =
    fromDateFilter && toDateFilter && fromDateFilter > toDateFilter
      ? [toDateFilter, fromDateFilter]
      : [fromDateFilter, toDateFilter];
  const sortCol = SORTABLE[params.sort ?? ""] ? (params.sort ?? "publication_date") : "publication_date";
  const sortDir = params.dir === "asc" ? "asc" : "desc";

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
      "id, title, entity_name, publication_date, cpv_main, base_price, currency, status, source, proposal_deadline_at",
      { count: "exact" },
    );

  if (appUser?.tenant_id) query = query.eq("tenant_id", appUser.tenant_id);
  if (cpvFilter) {
    const filterCore8 = cpvCore8(cpvFilter);
    if (filterCore8 && filterCore8 !== cpvFilter.trim()) {
      query = query.or(`cpv_main.ilike.%${cpvFilter}%,cpv_main.ilike.%${filterCore8}%`);
    } else {
      query = query.ilike("cpv_main", `%${cpvFilter}%`);
    }
  }
  if (entityFilter) query = query.ilike("entity_name", `%${entityFilter}%`);
  if (sourceFilter) query = query.eq("source", sourceFilter);

  if (statusFilter === "active") {
    const todayIso = new Date().toISOString();
    query = query.eq("status", "active").or(`proposal_deadline_at.is.null,proposal_deadline_at.gte.${todayIso}`);
  } else if (statusFilter === "expired") {
    const todayIso = new Date().toISOString();
    query = query.or(`status.eq.expired,and(status.eq.active,proposal_deadline_at.lt.${todayIso})`);
  } else if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  if (dateFrom) query = query.gte("publication_date", dateFrom);
  if (dateTo) query = query.lte("publication_date", dateTo);

  query = query
    .order(sortCol, { ascending: sortDir === "asc", nullsFirst: false })
    .range(from, to);

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
    const base: Record<string, string> = {
      page: String(page),
      cpv: cpvFilter,
      entity: entityFilter,
      source: sourceFilter,
      status: statusFilter,
      from_date: dateFrom,
      to_date: dateTo,
      sort: sortCol,
      dir: sortDir,
    };
    const merged = { ...base, ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])) };
    const parts = Object.entries(merged).filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
    return `/announcements?${parts.join("&")}`;
  }

  function exportQs() {
    const parts = [
      ["cpv", cpvFilter],
      ["entity", entityFilter],
      ["source", sourceFilter],
      ["status", statusFilter],
      ["from_date", dateFrom],
      ["to_date", dateTo],
      ["sort", sortCol],
      ["dir", sortDir],
    ]
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`);

    return `/api/announcements/export${parts.length > 0 ? `?${parts.join("&")}` : ""}`;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Megaphone}
        title="Anúncios"
        description={`${count ?? 0} anúncios`}
      />

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
        <select
          name="source"
          defaultValue={sourceFilter}
          className="border border-surface-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all bg-white"
        >
          <option value="">Fonte: Todas</option>
          <option value="DR_SCRAPE">Fonte: DR</option>
          <option value="BASE_API">Fonte: BASE</option>
        </select>
        <select
          name="status"
          defaultValue={statusFilter}
          className="border border-surface-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all bg-white"
        >
          <option value="">Estado: Todos</option>
          <option value="active">Ativo</option>
          <option value="expired">Expirado</option>
          <option value="cancelled">Cancelado</option>
          <option value="closed">Fechado</option>
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">De</label>
          <SingleDatePicker name="from_date" defaultValue={dateFrom} placeholder="Data início" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Até</label>
          <SingleDatePicker name="to_date" defaultValue={dateTo} placeholder="Data fim" />
        </div>
        <button
          type="submit"
          className="bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-brand-700 transition-all shadow-sm hover:shadow-md"
        >
          Filtrar
        </button>
        <a
          href={exportQs()}
          className="inline-flex items-center gap-2 bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-brand-700 transition-all shadow-sm hover:shadow-md"
        >
          <FileSpreadsheet className="h-4 w-4 text-white" />
          Exportar Excel
        </a>
        {(cpvFilter || entityFilter || sourceFilter || statusFilter || dateFrom || dateTo) && (
          <Link
            href="/announcements"
            className="text-gray-500 text-sm font-medium px-4 py-2 rounded-xl bg-white border border-surface-200 hover:bg-surface-50 transition-all shadow-card"
          >
            Limpar
          </Link>
        )}
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
