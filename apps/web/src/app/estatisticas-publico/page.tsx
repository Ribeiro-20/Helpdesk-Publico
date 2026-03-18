import Link from "next/link";
import Header from "@/components/layout/Header";
import BackButton from "@/components/BackButton";
import { createAdminClient } from "@/lib/supabase/server";
import { BarChart2, Building2, Filter, Search } from "lucide-react";
import PublicFooter from "@/components/layout/PublicFooter";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const BODY_BG = "rgba(248, 250, 252, 1)";
const GREEN = "rgba(74, 222, 128, 1)";

type PageParams = {
  page?: string;
  q?: string;
};

type TopCompany = {
  nif: string;
  name: string;
  count: number;
  value: number;
};

type EntityRow = {
  id: string;
  nif: string;
  name: string;
  entity_type: string | null;
  location: string | null;
  total_contracts: number;
  total_value: number;
  avg_contract_value: number | null;
  last_activity_at: string | null;
  top_companies: TopCompany[];
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function euros(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function integer(value: number): string {
  return new Intl.NumberFormat("pt-PT").format(value);
}

function shortDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-PT");
}

function parseTopCompanies(value: unknown): TopCompany[] {
  if (!Array.isArray(value)) return [];
  const out: TopCompany[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const nif = String(rec.nif ?? "").trim();
    const name = String(rec.name ?? "").trim();
    const count = Math.round(toNumber(rec.count));
    const total = toNumber(rec.value);
    if (!nif && !name) continue;

    out.push({
      nif,
      name: name || nif,
      count: Math.max(0, count),
      value: Math.max(0, total),
    });
  }

  return out.sort((a, b) => b.count - a.count);
}

function normalizeEntity(row: Record<string, unknown>): EntityRow {
  return {
    id: String(row.id ?? ""),
    nif: String(row.nif ?? ""),
    name: String(row.name ?? "Sem nome"),
    entity_type: toStringOrNull(row.entity_type),
    location: toStringOrNull(row.location),
    total_contracts: Math.max(0, Math.round(toNumber(row.total_contracts))),
    total_value: Math.max(0, toNumber(row.total_value)),
    avg_contract_value:
      row.avg_contract_value == null ? null : Math.max(0, toNumber(row.avg_contract_value)),
    last_activity_at: toStringOrNull(row.last_activity_at),
    top_companies: parseTopCompanies(row.top_companies),
  };
}

function supplierShare(row: EntityRow): number {
  const top = row.top_companies[0];
  if (!top || row.total_contracts <= 0) return 0;
  return (top.count / row.total_contracts) * 100;
}

function concentrationBadge(share: number): {
  label: string;
  className: string;
} {
  if (share >= 70) {
    return {
      label: "Alta",
      className: "bg-rose-50 text-rose-700 border border-rose-200",
    };
  }
  if (share >= 45) {
    return {
      label: "Media",
      className: "bg-amber-50 text-amber-700 border border-amber-200",
    };
  }
  return {
    label: "Baixa",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  };
}

function buildQuery(base: Record<string, string>, overrides: Record<string, string>): string {
  const params = new URLSearchParams();
  const merged = { ...base, ...overrides };

  for (const [key, value] of Object.entries(merged)) {
    if (!value || value === "all") continue;
    params.set(key, value);
  }

  const qs = params.toString();
  return qs ? `/estatisticas-publico?${qs}` : "/estatisticas-publico";
}

export default async function EstatisticasPublicoPage({
  searchParams,
}: {
  searchParams: Promise<PageParams>;
}) {
  const params = await searchParams;
  const page = parsePositiveInt(params.page, 1);
  const searchText = (params.q ?? "").trim();

  const supabase = await createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let tenantId: string | null = null;

  if (user?.id) {
    const { data: appUser } = await supabase
      .from("app_users")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    tenantId = (appUser?.tenant_id as string | undefined) ?? null;
  }

  if (!tenantId) {
    const { data: fallbackTenant } = await supabase
      .from("tenants")
      .select("id")
      .limit(1)
      .maybeSingle();
    tenantId = (fallbackTenant?.id as string | undefined) ?? null;
  }

  if (!tenantId) {
    return (
      <PageShell>
        <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">/estatisticas-publico</h1>
          <p className="text-sm text-gray-500 mt-2">
            Nao foi possivel resolver o tenant para mostrar estatisticas.
          </p>
        </section>
      </PageShell>
    );
  }

  let query = supabase
    .from("entities")
    .select(
      "id,nif,name,entity_type,location,total_contracts,total_value,avg_contract_value,last_activity_at,top_companies",
      { count: "exact" },
    )
    .eq("tenant_id", tenantId);

  if (searchText) {
    const token = searchText.replace(/[,%()]/g, " ");
    query = query.or(`name.ilike.%${token}%,nif.ilike.%${token}%`);
  }

  query = query.order("total_value", { ascending: false }).order("total_contracts", { ascending: false });

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: entityRows, count } = await query.range(from, to);

  const entities = ((entityRows ?? []) as Record<string, unknown>[]).map(normalizeEntity);
  const totalRows = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const currentPageContracts = entities.reduce((sum, row) => sum + row.total_contracts, 0);
  const currentPageValue = entities.reduce((sum, row) => sum + row.total_value, 0);

  const baseQuery: Record<string, string> = {
    q: searchText,
  };

  const hasFilters = !!searchText;

  const pages: Array<number | "dots"> = [];
  const addPage = (n: number) => {
    if (!pages.includes(n)) pages.push(n);
  };

  addPage(1);
  if (safePage > 3) pages.push("dots");
  for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i += 1) {
    addPage(i);
  }
  if (safePage < totalPages - 2) pages.push("dots");
  if (totalPages > 1) addPage(totalPages);

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart2 className="w-6 h-6 text-green-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Estatisticas de Entidades Adjudicantes
            </h1>
            <p className="text-gray-500 text-sm">
              {totalRows} entidades encontradas
            </p>
          </div>
        </div>
        <BackButton fallbackHref="/" className="w-fit shrink-0" />
      </div>

      <form className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <input
            name="q"
            defaultValue={searchText}
            placeholder="Pesquisar por entidade ou NIF"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all shadow-sm hover:opacity-90"
            style={{ background: GREEN, color: "#1a1a1a" }}
          >
            <Filter className="w-4 h-4" />
            Pesquisar
          </button>
          {hasFilters ? (
            <Link
              href="/estatisticas-publico"
              className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
            >
              Limpar
            </Link>
          ) : null}
        </div>
      </form>

      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Entidade
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Acao
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {entities.map((row) => {
                const contractsHref = `/mercado-publico?entity=${encodeURIComponent(row.nif)}`;

                return (
                  <tr key={row.id} className="hover:bg-green-50/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-green-700 font-medium leading-tight">{row.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {row.nif} {row.entity_type ? `· ${row.entity_type}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={contractsHref}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-800"
                      >
                        Ver contratos
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {entities.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-16 text-center text-gray-400">
                    Nenhuma entidade encontrada com estes filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-1 flex-wrap pb-4">
          {safePage > 1 && (
            <Link
              href={buildQuery(baseQuery, { page: String(safePage - 1) })}
              className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              ← Anterior
            </Link>
          )}

          {pages.map((p, i) =>
            p === "dots" ? (
              <span key={`dots-${i}`} className="px-2 py-1.5 text-sm text-gray-300">
                ...
              </span>
            ) : (
              <Link
                key={p}
                href={buildQuery(baseQuery, { page: String(p) })}
                className={
                  p === safePage
                    ? "px-3 py-1.5 text-sm font-medium rounded-xl text-gray-900"
                    : "px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
                }
                style={p === safePage ? { background: GREEN } : {}}
              >
                {p}
              </Link>
            ),
          )}

          {safePage < totalPages && (
            <Link
              href={buildQuery(baseQuery, { page: String(safePage + 1) })}
              className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              Proxima →
            </Link>
          )}
        </div>
      )}
    </PageShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-slate-50/60 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: BODY_BG }}>
      <Header />
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-10 space-y-6">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
