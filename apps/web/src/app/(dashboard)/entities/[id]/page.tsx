import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/layout/PageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";

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

/** Extract name from "NIF - Nome" format */
function extractName(raw: string): string {
  const idx = raw.indexOf(" - ");
  return idx === -1 ? raw : raw.slice(idx + 3);
}

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch entity first to get NIF/tenant_id
  const { data: entity } = await supabase
    .from("entities")
    .select("*")
    .eq("id", id)
    .single();

  if (!entity) notFound();

  // Now fetch contracts (via RPC — matches NIF in JSONB array) + announcements in parallel
  const [{ data: rawContracts }, { data: announcements }, annCountResult, { data: contractCount }] = await Promise.all([
    supabase.rpc("contracts_by_entity_nif", {
      p_tenant_id: entity.tenant_id,
      p_nif: entity.nif,
      p_limit: 10,
    }),
    supabase
      .from("announcements")
      .select("id, title, publication_date, cpv_main, base_price, currency")
      .eq("tenant_id", entity.tenant_id)
      .eq("entity_nif", entity.nif)
      .order("publication_date", { ascending: false })
      .limit(10),
    supabase
      .from("announcements")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", entity.tenant_id)
      .eq("entity_nif", entity.nif),
    supabase.rpc("count_contracts_by_entity_nif", {
      p_tenant_id: entity.tenant_id,
      p_nif: entity.nif,
    }),
  ]);

  const recentContracts = (rawContracts ?? []) as ContractRow[];

  // Use live counts instead of stored (potentially stale) counters
  const liveAnnouncementCount = annCountResult.count ?? entity.total_announcements;
  const liveContractCount = contractCount ?? entity.total_contracts;

  const topCpvs: Array<{ code: string; count: number; description?: string }> = Array.isArray(entity.top_cpvs) ? entity.top_cpvs : [];
  const topCompanies: Array<{ nif: string; name: string; count: number; value: number }> = Array.isArray(entity.top_companies) ? entity.top_companies : [];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <PageHeader
        icon={Building2}
        title={entity.name}
        backHref="/entities"
        backLabel="Entidades"
        size="detail"
        meta={
          <>
            <span className="text-sm font-mono text-gray-400">{entity.nif}</span>
            {entity.location && (
              <span className="text-sm text-gray-400">{entity.location}</span>
            )}
          </>
        }
        badge={
          entity.entity_type ? (
            <span
              className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${TYPE_BADGE[entity.entity_type] ?? "bg-gray-100 text-gray-600"}`}
            >
              {TYPE_LABEL[entity.entity_type] ?? entity.entity_type}
            </span>
          ) : undefined
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-card">
          <p className="text-xs text-gray-400 mb-1">Anúncios</p>
          <p className="text-2xl font-bold text-gray-900">{liveAnnouncementCount}</p>
        </div>
        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-card">
          <p className="text-xs text-gray-400 mb-1">Contratos</p>
          <p className="text-2xl font-bold text-gray-900">{liveContractCount}</p>
        </div>
        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-card">
          <p className="text-xs text-gray-400 mb-1">Valor Total</p>
          <p className="text-2xl font-bold text-brand-700">{formatEurShort(entity.total_value)}</p>
        </div>
        <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-card">
          <p className="text-xs text-gray-400 mb-1">Valor Médio</p>
          <p className="text-2xl font-bold text-gray-700">{formatEurShort(entity.avg_contract_value)}</p>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Dados gerais */}
        <InfoCard title="Dados Gerais">
          <Field label="Nome" value={entity.name} />
          <Field label="NIF" value={entity.nif} mono />
          <Field label="Tipo" value={TYPE_LABEL[entity.entity_type] ?? entity.entity_type} />
          <Field label="Localização" value={entity.location} />
          <Field label="Sector" value={entity.sector} />
          {entity.detail_url && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Portal BASE</p>
              <a
                href={entity.detail_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline text-sm break-all"
              >
                {entity.detail_url}
              </a>
            </div>
          )}
          <Field
            label="Última actividade"
            value={entity.last_activity_at ? new Date(entity.last_activity_at).toLocaleDateString("pt-PT") : null}
          />
        </InfoCard>

        {/* Top CPVs */}
        <InfoCard title="CPVs mais contratados">
          {topCpvs.length === 0 ? (
            <p className="text-sm text-gray-400">Sem dados CPV</p>
          ) : (
            topCpvs.map((cpv, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono">
                  {cpv.code}
                </span>
                <span className="text-xs text-gray-500">{cpv.count} contratos</span>
              </div>
            ))
          )}
        </InfoCard>

        {/* Top Companies */}
        <InfoCard title="Empresas mais adjudicadas">
          {topCompanies.length === 0 ? (
            <p className="text-sm text-gray-400">Sem dados de empresas</p>
          ) : (
            topCompanies.map((comp, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{comp.name}</p>
                  <p className="text-xs text-gray-400">
                    <span className="font-mono">{comp.nif}</span>
                    <span className="mx-1">&middot;</span>
                    {comp.count} contratos
                    <span className="mx-1">&middot;</span>
                    {formatEurShort(comp.value)}
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
          Últimos Contratos ({recentContracts.length})
        </h3>
        {recentContracts.length === 0 ? (
          <p className="text-gray-400 text-sm">Sem contratos registados</p>
        ) : (
          <div className="space-y-2">
            {recentContracts.map((c) => (
              <div key={c.id} className="flex items-start gap-3 text-sm border-b border-surface-100 last:border-0 pb-2 last:pb-0">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 shrink-0" />
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
                    {Array.isArray(c.winners) && c.winners.length > 0 && (
                      <span className="text-xs text-gray-400 truncate max-w-[200px]">
                        {extractName(c.winners[0])}
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
              href={`/contracts?entity_nif=${encodeURIComponent(entity.nif)}`}
              className="text-brand-600 hover:underline text-sm"
            >
              Ver todos os contratos &rarr;
            </Link>
          </div>
        )}
      </div>

      {/* Recent announcements */}
      <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-3">
          Últimos Anúncios ({announcements?.length ?? 0})
        </h3>
        {(announcements ?? []).length === 0 ? (
          <p className="text-gray-400 text-sm">Sem anúncios registados</p>
        ) : (
          <div className="space-y-2">
            {(announcements ?? []).map((a) => (
              <div key={a.id} className="flex items-start gap-3 text-sm border-b border-surface-100 last:border-0 pb-2 last:pb-0">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/announcements/${a.id}`}
                    className="text-brand-600 hover:underline font-medium line-clamp-1"
                  >
                    {a.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    {a.publication_date && (
                      <span className="text-xs text-gray-400">{a.publication_date}</span>
                    )}
                    {a.cpv_main && (
                      <span className="inline-block bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-mono">
                        {a.cpv_main}
                      </span>
                    )}
                    {a.base_price != null && (
                      <span className="text-xs font-medium text-gray-700">
                        {formatEur(a.base_price)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {(announcements?.length ?? 0) >= 10 && (
          <div className="mt-3 pt-2 border-t border-surface-100">
            <Link
              href={`/announcements?entity=${encodeURIComponent(entity.name)}`}
              className="text-brand-600 hover:underline text-sm"
            >
              Ver todos os anúncios &rarr;
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
