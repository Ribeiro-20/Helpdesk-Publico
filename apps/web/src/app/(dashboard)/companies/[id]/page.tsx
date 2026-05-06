import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/layout/PageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Factory } from "lucide-react";

export const dynamic = "force-dynamic";

interface ContractRow {
  id: string;
  object: string | null;
  contract_price: number | null;
  publication_date: string | null;
  signing_date: string | null;
  cpv_main: string | null;
  contracting_entities: string[];
  winners: string[];
  procedure_type: string | null;
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-3">
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}) {
  if (value == null || value === "") return null;
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function formatEur(val: number | null | undefined): string {
  if (val == null || val === 0) return "\u2014";
  return val.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";
}

function formatEurShort(val: number | null | undefined): string {
  if (val == null || val === 0) return "\u2014";
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M \u20AC`;
  }
  if (val >= 1_000) {
    return `${(val / 1_000).toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k \u20AC`;
  }
  return `${val.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} \u20AC`;
}

/** Extract name from "NIF - Nome" */
function extractName(raw: string): string {
  const idx = raw.indexOf(" - ");
  return idx === -1 ? raw : raw.slice(idx + 3);
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (!company) notFound();

  // Fetch contracts via RPC (matches NIF in JSONB winners array) + live count
  const [{ data: rawContracts }, { data: contractCount }] = await Promise.all([
    supabase.rpc("contracts_by_winner_nif", {
      p_tenant_id: company.tenant_id,
      p_nif: company.nif,
      p_limit: 10,
    }),
    supabase.rpc("count_contracts_by_winner_nif", {
      p_tenant_id: company.tenant_id,
      p_nif: company.nif,
    }),
  ]);

  const recentContracts = (rawContracts ?? []) as ContractRow[];

  // Use live count if available
  const liveContractsWon = contractCount ?? company.contracts_won;

  const cpvSpec: Array<{ code: string; count: number; value: number; description?: string }> =
    Array.isArray(company.cpv_specialization) ? company.cpv_specialization : [];
  const topEntities: Array<{ nif: string; name: string; count: number; value: number }> =
    Array.isArray(company.top_entities) ? company.top_entities : [];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <PageHeader
        icon={Factory}
        title={company.name}
        backHref="/companies"
        backLabel="Empresas"
        size="detail"
        meta={
          <>
            <span className="text-sm font-mono text-gray-400">{company.nif}</span>
            {company.location && (
              <span className="text-sm text-gray-400">{company.location}</span>
            )}
          </>
        }
        badge={
          company.win_rate != null ? (
            <span
              className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${
                company.win_rate >= 50
                  ? "bg-green-50 text-green-700 border border-green-100"
                  : company.win_rate >= 25
                  ? "bg-amber-50 text-amber-700 border border-amber-100"
                  : "bg-gray-100 text-gray-600 border border-gray-200"
              }`}
            >
              {Number(company.win_rate).toFixed(0)}% taxa vitória
            </span>
          ) : undefined
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-card">
          <p className="text-xs text-gray-400 mb-1">Contratos Ganhos</p>
          <p className="text-2xl font-bold text-gray-900">{liveContractsWon}</p>
        </div>
        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-card">
          <p className="text-xs text-gray-400 mb-1">Participações</p>
          <p className="text-2xl font-bold text-gray-700">{company.contracts_participated}</p>
        </div>
        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-card">
          <p className="text-xs text-gray-400 mb-1">Valor Total Ganho</p>
          <p className="text-2xl font-bold text-brand-700">{formatEurShort(company.total_value_won)}</p>
        </div>
        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-card">
          <p className="text-xs text-gray-400 mb-1">Valor Médio</p>
          <p className="text-2xl font-bold text-gray-700">{formatEurShort(company.avg_contract_value)}</p>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Dados gerais */}
        <InfoCard title="Dados Gerais">
          <Field label="Nome" value={company.name} />
          <Field label="NIF" value={company.nif} mono />
          <Field label="Localização" value={company.location} />
          <Field
            label="Taxa de vitória"
            value={company.win_rate != null ? `${Number(company.win_rate).toFixed(1)}%` : null}
          />
          {company.detail_url && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Portal BASE</p>
              <a
                href={company.detail_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline text-sm break-all"
              >
                {company.detail_url}
              </a>
            </div>
          )}
          <Field
            label="Último contrato ganho"
            value={company.last_win_at ? new Date(company.last_win_at).toLocaleDateString("pt-PT") : null}
          />
        </InfoCard>

        {/* CPV Specialization */}
        <InfoCard title="Especialização CPV">
          {cpvSpec.length === 0 ? (
            <p className="text-sm text-gray-400">Sem dados de especialização</p>
          ) : (
            cpvSpec.map((cpv, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono shrink-0">
                    {cpv.code}
                  </span>
                  {cpv.description && (
                    <span className="text-xs text-gray-400 truncate">{cpv.description}</span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-gray-500">{cpv.count}x</span>
                  <span className="text-xs text-gray-400 ml-1">{formatEurShort(cpv.value)}</span>
                </div>
              </div>
            ))
          )}
        </InfoCard>

        {/* Top Entities */}
        <InfoCard title="Top Entidades">
          {topEntities.length === 0 ? (
            <p className="text-sm text-gray-400">Sem dados de entidades</p>
          ) : (
            topEntities.map((ent, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{ent.name}</p>
                  <p className="text-xs text-gray-400">
                    <span className="font-mono">{ent.nif}</span>
                    <span className="mx-1">&middot;</span>
                    {ent.count} contratos
                    <span className="mx-1">&middot;</span>
                    {formatEurShort(ent.value)}
                  </p>
                </div>
              </div>
            ))
          )}
        </InfoCard>
      </div>

      {/* Recent contracts */}
      <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-3">
          Últimos Contratos Ganhos ({recentContracts.length})
        </h3>
        {recentContracts.length === 0 ? (
          <p className="text-gray-400 text-sm">Sem contratos registados</p>
        ) : (
          <div className="space-y-2">
            {recentContracts.map((c) => (
              <div key={c.id} className="flex items-start gap-3 text-sm border-b border-surface-100 last:border-0 pb-2 last:pb-0">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/contracts/${c.id}`}
                    className="text-brand-600 hover:underline font-medium line-clamp-1"
                  >
                    {c.object || "Sem objecto"}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    {(c.signing_date || c.publication_date) && (
                      <span className="text-xs text-gray-400">
                        {new Date((c.signing_date ?? c.publication_date)!).toLocaleDateString("pt-PT")}
                      </span>
                    )}
                    {c.cpv_main && (
                      <span className="inline-block bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-mono">
                        {c.cpv_main}
                      </span>
                    )}
                    {c.contract_price != null && (
                      <span className="text-xs font-medium text-gray-700">{formatEur(c.contract_price)}</span>
                    )}
                    {Array.isArray(c.contracting_entities) && c.contracting_entities.length > 0 && (
                      <span className="text-xs text-gray-400 truncate max-w-[200px]">
                        {extractName(c.contracting_entities[0])}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {recentContracts.length >= 10 && (
          <div className="mt-3 pt-2 border-t border-surface-100">
            <Link
              href={`/contracts?winner_nif=${encodeURIComponent(company.nif)}`}
              className="text-brand-600 hover:underline text-sm"
            >
              Ver todos os contratos &rarr;
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
