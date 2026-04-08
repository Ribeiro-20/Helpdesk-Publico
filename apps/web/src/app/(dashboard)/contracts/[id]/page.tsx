import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

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

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
  const displayValue =
    String(value).toUpperCase() === "NULL" ? "Não aplicável" : value;
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>
        {displayValue}
      </p>
    </div>
  );
}

function PriceField({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number | null | undefined;
  highlight?: boolean;
}) {
  if (value == null) return null;
  const formatted = value.toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p
        className={`text-sm ${highlight ? "text-brand-700 font-bold" : "text-gray-900 font-medium"}`}
      >
        {formatted} &euro;
      </p>
    </div>
  );
}

function extractName(raw: string): string {
  const idx = raw.indexOf(" - ");
  return idx === -1 ? raw : raw.slice(idx + 3);
}

function extractNif(raw: string): string {
  const idx = raw.indexOf(" - ");
  return idx === -1 ? "" : raw.slice(0, idx);
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: contract }, { data: modifications }] = await Promise.all([
    supabase.from("contracts").select("*").eq("id", id).single(),
    supabase
      .from("contract_modifications")
      .select(
        "id, modification_no, description, reason, previous_price, new_price, price_delta, modification_date, raw_hash",
      )
      .eq("contract_id", id)
      .order("modification_no", { ascending: true }),
  ]);

  if (!contract) notFound();

  const cpvList: string[] = Array.isArray(contract.cpv_list)
    ? contract.cpv_list
    : [];
  const entities: string[] = Array.isArray(contract.contracting_entities)
    ? contract.contracting_entities
    : [];
  const winners: string[] = Array.isArray(contract.winners)
    ? contract.winners
    : [];
  const locations: string[] = Array.isArray(contract.execution_locations)
    ? contract.execution_locations
    : [];

  // Calculate discount percentage
  let discountPct: number | null = null;
  if (
    contract.base_price != null &&
    contract.contract_price != null &&
    contract.base_price > 0
  ) {
    discountPct =
      ((contract.base_price - contract.contract_price) / contract.base_price) *
      100;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/contracts"
          className="text-sm text-gray-400 hover:text-gray-600 mt-1 shrink-0"
        >
          &larr; Contratos
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">
            {contract.object || "Contrato sem objecto"}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            {contract.procedure_type && (
              <span className="text-gray-500 text-sm">
                {contract.procedure_type}
              </span>
            )}
            {contract.publication_date && (
              <span className="text-gray-400 text-sm">
                Publicado em {contract.publication_date}
              </span>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_BADGE[contract.status] ?? "bg-gray-100 text-gray-600"}`}
        >
          {STATUS_LABEL[contract.status] ?? contract.status}
        </span>
      </div>

      {/* Price summary card */}
      <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-4">
          Valores
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Preco Base</p>
            <p className="text-lg font-medium text-gray-600">
              {contract.base_price != null
                ? `${Number(contract.base_price).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} \u20AC`
                : "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Preco Contratual</p>
            <p className="text-lg font-bold text-brand-700">
              {contract.contract_price != null
                ? `${Number(contract.contract_price).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} \u20AC`
                : "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Preco Efectivo</p>
            <p
              className={`text-lg font-medium ${contract.status === "modified" ? "text-amber-700" : "text-gray-600"}`}
            >
              {contract.effective_price != null
                ? `${Number(contract.effective_price).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} \u20AC`
                : "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Desconto</p>
            {discountPct != null ? (
              <p
                className={`text-lg font-medium ${discountPct > 0 ? "text-green-700" : "text-red-700"}`}
              >
                {discountPct > 0 ? "-" : "+"}
                {Math.abs(discountPct).toFixed(1)}%
              </p>
            ) : (
              <p className="text-lg text-gray-300">&mdash;</p>
            )}
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Entidades adjudicantes */}
        <InfoCard title="Entidade Adjudicante">
          {entities.length === 0 ? (
            <p className="text-sm text-gray-400">Sem informação</p>
          ) : (
            entities.map((raw, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {extractName(raw)}
                  </p>
                  <p className="text-xs text-gray-400 font-mono">
                    {extractNif(raw)}
                  </p>
                </div>
              </div>
            ))
          )}
        </InfoCard>

        {/* Entidades vencedoras */}
        <InfoCard title="Entidade(s) Vencedora(s)">
          {winners.length === 0 ? (
            <p className="text-sm text-gray-400">Sem informação</p>
          ) : (
            winners.map((raw, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {extractName(raw)}
                  </p>
                  <p className="text-xs text-gray-400 font-mono">
                    {extractNif(raw)}
                  </p>
                </div>
              </div>
            ))
          )}
        </InfoCard>

        {/* Datas */}
        <InfoCard title="Cronologia">
          <Field label="Data de publicação" value={contract.publication_date} />
          <Field label="Data de adjudicação" value={contract.award_date} />
          <Field label="Data de celebração" value={contract.signing_date} />
          <Field label="Data de fecho" value={contract.close_date} />
          <Field
            label="Prazo de execução"
            value={
              contract.execution_deadline_days
                ? `${contract.execution_deadline_days} dias`
                : null
            }
          />
        </InfoCard>

        {/* CPV */}
        <InfoCard title="CPV">
          <Field label="CPV principal" value={contract.cpv_main} mono />
          {cpvList.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Lista CPV</p>
              <div className="flex flex-wrap gap-1">
                {cpvList.map((c: string, i: number) => (
                  <span
                    key={i}
                    className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </InfoCard>

        {/* Local de execucao */}
        {locations.length > 0 && (
          <InfoCard title="Local de Execução">
            {locations.map((loc, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                <p className="text-sm text-gray-700">{loc}</p>
              </div>
            ))}
          </InfoCard>
        )}

        {/* Procedimento */}
        <InfoCard title="Procedimento">
          <Field label="Tipo de procedimento" value={contract.procedure_type} />
          <Field label="Tipo de contrato" value={contract.contract_type} />
          <Field label="Tipo de anúncio" value={contract.announcement_type} />
          <Field label="Regime jurídico" value={contract.legal_regime} />
          <Field label="Fundamentação" value={contract.legal_basis} />
          <Field label="Tipo de fim" value={contract.end_type} />
          {contract.is_centralized && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Centralizado</p>
              <span className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">
                Sim
              </span>
            </div>
          )}
          {contract.is_ecological && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Ecológico</p>
              <span className="inline-block bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded">
                Sim
              </span>
            </div>
          )}
        </InfoCard>

        {/* Documentos */}
        {contract.procedure_docs_url && (
          <div className="bg-brand-50/60 border border-brand-200/60 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Documentos
            </p>
            <a
              href={contract.procedure_docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-medium text-sm hover:underline"
            >
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
              Peças do Procedimento / Contrato
            </a>
          </div>
        )}

        {/* Referencias */}
        <InfoCard title="Referências">
          <Field
            label="ID Contrato BASE"
            value={contract.base_contract_id}
            mono
          />
          <Field
            label="ID Procedimento"
            value={contract.base_procedure_id}
            mono
          />
          <Field
            label="Nº Anúncio"
            value={contract.base_announcement_no}
            mono
          />
          <Field label="ID INCM" value={contract.base_incm_id} mono />
          {contract.framework_agreement && (
            <Field label="Acordo Quadro" value={contract.framework_agreement} />
          )}
          {contract.announcement_id && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Anúncio associado</p>
              <Link
                href={`/announcements/${contract.announcement_id}`}
                className="text-brand-600 hover:underline text-sm"
              >
                Ver anúncio original &rarr;
              </Link>
            </div>
          )}
        </InfoCard>
      </div>

      {/* Concorrentes */}
      {contract.competitors && (
        <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-2">
            Concorrentes
          </h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {contract.competitors}
          </p>
        </div>
      )}

      {/* Descricao */}
      {contract.description && (
        <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-2">
            Descrição
          </h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {contract.description}
          </p>
        </div>
      )}

      {/* Observacoes */}
      {contract.observations && (
        <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-2">
            Observações
          </h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {contract.observations}
          </p>
        </div>
      )}

      {/* Modificacoes contratuais */}
      <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-3">
          Modificações contratuais ({modifications?.length ?? 0})
        </h3>
        {(modifications ?? []).length === 0 ? (
          <p className="text-gray-400 text-sm">Sem modificações registadas</p>
        ) : (
          <div className="space-y-3">
            {(modifications ?? []).map((mod) => (
              <div
                key={mod.id}
                className="border border-surface-100 rounded-lg p-3"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                    {mod.modification_no}
                  </span>
                  {mod.modification_date && (
                    <span className="text-xs text-gray-400">
                      {mod.modification_date}
                    </span>
                  )}
                  {mod.price_delta != null && (
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        mod.price_delta > 0
                          ? "bg-red-50 text-red-700"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      {mod.price_delta > 0 ? "+" : ""}
                      {Number(mod.price_delta).toLocaleString("pt-PT", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      &euro;
                    </span>
                  )}
                </div>
                {mod.description && (
                  <p className="text-sm text-gray-700">{mod.description}</p>
                )}
                {mod.reason && (
                  <p className="text-xs text-gray-400 mt-1">{mod.reason}</p>
                )}
                {mod.previous_price != null && mod.new_price != null && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                    <span>
                      {Number(mod.previous_price).toLocaleString("pt-PT", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      &euro;
                    </span>
                    <span className="text-gray-300">&rarr;</span>
                    <span className="font-medium text-gray-700">
                      {Number(mod.new_price).toLocaleString("pt-PT", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      &euro;
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raw payload (collapsible) */}
      <details className="bg-white border border-surface-200 rounded-xl shadow-card">
        <summary className="p-5 cursor-pointer text-sm font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700">
          Dados brutos (JSON)
        </summary>
        <div className="px-5 pb-5">
          <pre className="text-xs text-gray-600 bg-surface-50 rounded-lg p-4 overflow-x-auto max-h-96">
            {JSON.stringify(contract.raw_payload, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}
