import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { effectiveStatus, STATUS_BADGE, STATUS_LABEL } from "@/lib/announcements";

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
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: ann }, { data: versions }] = await Promise.all([
    supabase.from("announcements").select("*").eq("id", id).single(),
    supabase
      .from("announcement_versions")
      .select("id, raw_hash, changed_at, change_summary")
      .eq("announcement_id", id)
      .order("changed_at", { ascending: false }),
  ]);

  if (!ann) notFound();

  const cpvList: string[] = Array.isArray(ann.cpv_list) ? ann.cpv_list : [];
  const displayStatus = effectiveStatus(ann);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/announcements"
          className="text-sm text-gray-400 hover:text-gray-600 mt-1 shrink-0"
        >
          ← Anúncios
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">
            {ann.title}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Publicado em {ann.publication_date}
          </p>
        </div>
        <span
          className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_BADGE[displayStatus] ?? "bg-gray-100 text-gray-600"}`}
        >
          {STATUS_LABEL[displayStatus] ?? displayStatus}
        </span>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard title="Entidade e procedimento">
          <Field label="Entidade" value={ann.entity_name} />
          <Field label="NIF" value={ann.entity_nif} mono />
          <Field label="Tipo de procedimento" value={ann.procedure_type} />
          <Field label="Tipo de acto" value={ann.act_type} />
          <Field label="Tipo de contrato" value={ann.contract_type} />
        </InfoCard>

        <InfoCard title="Valores e prazos">
          <Field
            label="Preço base"
            value={
              ann.base_price != null
                ? `${Number(ann.base_price).toLocaleString("pt-PT")} ${ann.currency}`
                : null
            }
          />
          <Field label="Prazo (dias)" value={ann.proposal_deadline_days} />
          <Field
            label="Data limite"
            value={
              ann.proposal_deadline_at
                ? new Date(ann.proposal_deadline_at).toLocaleDateString("pt-PT")
                : null
            }
          />
        </InfoCard>

        <InfoCard title="CPV">
          <Field label="CPV principal" value={ann.cpv_main} mono />
          {cpvList.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Lista CPV</p>
              <div className="flex flex-wrap gap-1">
                {cpvList.map((c: string) => (
                  <span
                    key={c}
                    className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </InfoCard>

        <InfoCard title="Referências">
          <Field label="ID BASE" value={ann.base_announcement_id} mono />
          <Field label="Nº DR" value={ann.dr_announcement_no} />
          {ann.detail_url && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Link original</p>
              <a
                href={ann.detail_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline text-sm break-all"
              >
                {ann.detail_url}
              </a>
            </div>
          )}
        </InfoCard>
      </div>

      {/* Description */}
      {ann.description && (
        <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-2">
            Descrição
          </h3>
          <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
            {ann.description}
          </p>
        </div>
      )}

      {/* Version history */}
      <div className="bg-white border border-surface-200 rounded-xl p-5 shadow-card">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-3">
          Histórico de versões ({versions?.length ?? 0})
        </h3>
        {(versions ?? []).length === 0 ? (
          <p className="text-gray-400 text-sm">Sem versões anteriores</p>
        ) : (
          <div className="space-y-2">
            {(versions ?? []).map((v, i) => (
              <div key={v.id} className="flex items-start gap-3 text-sm">
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${i === 0 ? "bg-green-500" : "bg-gray-300"}`}
                />
                <div>
                  <span className="font-medium text-gray-700">
                    {new Date(v.changed_at).toLocaleString("pt-PT")}
                  </span>
                  <span className="text-gray-400 ml-2 font-mono text-xs">
                    {(v.raw_hash as string).slice(0, 12)}…
                  </span>
                  {v.change_summary &&
                    Object.keys(v.change_summary as object).length > 0 && (
                      <p className="text-gray-400 text-xs mt-0.5 font-mono">
                        {JSON.stringify(v.change_summary)}
                      </p>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
