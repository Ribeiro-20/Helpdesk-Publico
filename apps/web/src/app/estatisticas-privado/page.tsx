import Link from "next/link";
import Image from "next/image";
import Header from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";
import { BarChart2, Filter } from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const NAV_BG = "rgba(26, 27, 31, 1)";
const BODY_BG = "rgba(248, 250, 252, 1)";
const GREEN = "rgba(74, 222, 128, 1)";

const FOOTER_COLS: Record<string, string[]> = {
  SERVICOS: [
    "Servicos Adjudicantes",
    "Servicos Empresas e Adjudicatarias",
    "Alerta Concursos Publicos",
    "Identificacao CPV",
  ],
  RECURSOS: ["Blog", "ESG e Sustentabilidade", "RH", "FAQs"],
  INSTITUCIONAL: ["Sobre Nos"],
};

type PageParams = {
  page?: string;
  q?: string;
};

type TopEntity = {
  nif: string;
  name: string;
  count: number;
  value: number;
};

type CompanyRow = {
  id: string;
  nif: string;
  name: string;
  location: string | null;
  contracts_won: number;
  total_value_won: number;
  avg_contract_value: number | null;
  win_rate: number | null;
  last_win_at: string | null;
  top_entities: TopEntity[];
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

function parseTopEntities(value: unknown): TopEntity[] {
  if (!Array.isArray(value)) return [];
  const out: TopEntity[] = [];

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

function normalizeCompany(row: Record<string, unknown>): CompanyRow {
  return {
    id: String(row.id ?? ""),
    nif: String(row.nif ?? ""),
    name: String(row.name ?? "Sem nome"),
    location: toStringOrNull(row.location),
    contracts_won: Math.max(0, Math.round(toNumber(row.contracts_won))),
    total_value_won: Math.max(0, toNumber(row.total_value_won)),
    avg_contract_value:
      row.avg_contract_value == null ? null : Math.max(0, toNumber(row.avg_contract_value)),
    win_rate: row.win_rate == null ? null : Math.max(0, toNumber(row.win_rate)),
    last_win_at: toStringOrNull(row.last_win_at),
    top_entities: parseTopEntities(row.top_entities),
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
  return qs ? `/estatisticas-privado?${qs}` : "/estatisticas-privado";
}

export default async function EstatisticasPrivadoPage({
  searchParams,
}: {
  searchParams: Promise<PageParams>;
}) {
  const params = await searchParams;
  const page = parsePositiveInt(params.page, 1);
  const searchText = (params.q ?? "").trim();

  const supabase = await createClient();

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
          <h1 className="text-xl font-semibold text-gray-900">/estatisticas-privado</h1>
          <p className="text-sm text-gray-500 mt-2">
            Nao foi possivel resolver o tenant para mostrar estatisticas.
          </p>
        </section>
      </PageShell>
    );
  }

  let query = supabase
    .from("companies")
    .select(
      "id,nif,name,location,contracts_won,total_value_won,avg_contract_value,win_rate,last_win_at,top_entities",
      { count: "exact" },
    )
    .eq("tenant_id", tenantId);

  if (searchText) {
    const token = searchText.replace(/[,%()]/g, " ");
    query = query.or(`name.ilike.%${token}%,nif.ilike.%${token}%`);
  }

  query = query
    .order("total_value_won", { ascending: false })
    .order("contracts_won", { ascending: false });

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: companyRows, count } = await query.range(from, to);

  const companies = ((companyRows ?? []) as Record<string, unknown>[]).map(normalizeCompany);
  const totalRows = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

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
      <div className="flex items-center gap-3">
        <BarChart2 className="w-6 h-6 text-green-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Estatisticas de Empresas Adjudicatárias
          </h1>
          <p className="text-gray-500 text-sm">{totalRows} empresas encontradas</p>
        </div>
      </div>

      <form className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <input
            name="q"
            defaultValue={searchText}
            placeholder="Pesquisar por empresa ou NIF"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all shadow-sm hover:opacity-90"
            style={{ background: GREEN, color: "#1a1a1a" }}
          >
            <Filter className="w-4 h-4" />
            Filtrar
          </button>
          {hasFilters ? (
            <Link
              href="/estatisticas-privado"
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
                  Empresa
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Acao
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {companies.map((row) => {
                const contractsHref = `/mercado-publico?winner=${encodeURIComponent(row.nif)}`;


                return (
                  <tr key={row.id} className="hover:bg-green-50/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-green-700 font-medium leading-tight">{row.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {row.nif}
                        {row.location ? ` · ${row.location}` : ""}
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

              {companies.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-16 text-center text-gray-400">
                    Nenhuma empresa encontrada com estes filtros.
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

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: BODY_BG }}>
      <Header />
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-10 space-y-6">
        {children}
      </main>
      <footer className="text-white pt-12 pb-6 px-10" style={{ background: NAV_BG }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-20 pb-10 border-b border-white/10">
            <div className="flex flex-col gap-4">
              <Image
                src="/logo-white.webp"
                alt="Helpdesk Publico"
                width={180}
                height={60}
                className="object-contain"
              />
              <p className="text-sm text-gray-400 leading-relaxed">
                Solucoes especializadas em Contratacao Publica Eficiente. Apoiamos entidades
                adjudicantes e operadores economicos em todo o processo de concurso publico.
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
                        className="text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-5 flex flex-col items-center gap-3 text-xs text-gray-500 text-center">
            <p>
              © 2023 Helpdesk Publico. Todos os direitos reservados. Contratacao Publica Eficiente.
            </p>
            <div className="flex items-center justify-center gap-5">
              <Link href="#" className="hover:text-gray-300 transition-colors">
                Politica de Privacidade
              </Link>
              <Link href="#" className="hover:text-gray-300 transition-colors">
                Termos e Condicoes
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
