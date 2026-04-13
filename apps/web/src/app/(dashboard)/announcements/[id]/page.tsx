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

function pickRaw(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length > 0) return String(value[0]);
      continue;
    }
    return String(value);
  }
  return null;
}

function extractProcedurePiecesUrl(payload: Record<string, unknown>): string | null {
  const detalle = payload.detalhe_conteudo;
  if (!detalle || typeof detalle !== "object") return null;

  const texto = (detalle as Record<string, unknown>).Texto;
  if (typeof texto !== "string" || !texto.trim()) return null;

  const labeled = texto.match(/Link\s+para\s+acesso\s+[àa]\s*s\s*pe[cç]as\s+do\s+concurso\s*\(URL\)\s*:\s*(https?:\/\/\S+)/i)
    ?? texto.match(/Link\s+para\s+acesso\s+[àa]s\s+pe[cç]as\s+do\s+concurso\s*\(URL\)\s*:\s*(https?:\/\/\S+)/i);
  if (labeled) return labeled[1];

  const acingov = texto.match(/https?:\/\/\S*downloadProcedurePiece\/\S+/i);
  if (acingov) return acingov[0];

  const generic = texto.match(/https?:\/\/\S+/i);
  return generic ? generic[0] : null;
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

function cpvCore8(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : "";
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

  const cpvListRaw: string[] = Array.isArray(ann.cpv_list) ? ann.cpv_list : [];
  const normalizedMainCpv = normalizeCpvCode(ann.cpv_main);
  const normalizedListCpvs = Array.from(
    new Set(cpvListRaw.map((code) => normalizeCpvCode(code)).filter((code): code is string => Boolean(code))),
  );

  const cpvShortCodes = Array.from(
    new Set(
      [normalizedMainCpv, ...normalizedListCpvs].filter((code): code is string => Boolean(code && /^\d{8}$/.test(code))),
    ),
  );

  const cpvDisplayMap = new Map<string, string>();
  if (cpvShortCodes.length > 0) {
    const orFilter = cpvShortCodes.map((code) => `id.ilike.${code}-%`).join(",");
    const { data: cpvRows } = await supabase
      .from("cpv_codes")
      .select("id")
      .or(orFilter)
      .limit(Math.max(20, cpvShortCodes.length * 3));

    for (const row of cpvRows ?? []) {
      const id = String((row as { id?: unknown }).id ?? "").trim();
      if (!id) continue;
      const core = cpvCore8(id);
      if (core && !cpvDisplayMap.has(core)) cpvDisplayMap.set(core, id);
    }
  }

  const resolveCpvDisplay = (code: string | null | undefined): string | null => {
    const normalized = normalizeCpvCode(code);
    if (!normalized) return null;
    if (/^\d{8}$/.test(normalized)) return cpvDisplayMap.get(normalized) ?? normalized;
    return normalized;
  };

  const cpvMainDisplay = resolveCpvDisplay(normalizedMainCpv);
  const cpvListDisplay = Array.from(
    new Set(normalizedListCpvs.map((code) => resolveCpvDisplay(code)).filter((code): code is string => Boolean(code))),
  );
  const displayStatus = effectiveStatus(ann);
  const rawPayload = (ann.raw_payload ?? {}) as Record<string, unknown>;
  const payloadRoot = (rawPayload.payload && typeof rawPayload.payload === "object")
    ? (rawPayload.payload as Record<string, unknown>)
    : rawPayload;
  const piecesUrl =
    pickRaw(payloadRoot, ["PecasProcedimento", "linkPecasProc"]) ??
    extractProcedurePiecesUrl(payloadRoot) ??
    ann.detail_url;

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
          <Field label="CPV principal" value={cpvMainDisplay} mono />
          {cpvListDisplay.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Lista CPV</p>
              <div className="flex flex-wrap gap-1">
                {cpvListDisplay.map((c: string) => (
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
          {!cpvMainDisplay && cpvListDisplay.length === 0 && (
            <p className="text-sm text-gray-400">Sem CPV identificado no anúncio de origem.</p>
          )}
        </InfoCard>

        <InfoCard title="Referências">
          <Field label="Nº DR" value={ann.dr_announcement_no} />
          {piecesUrl && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Peças do procedimento</p>
              <a
                href={piecesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline text-sm break-all"
              >
                {piecesUrl}
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

      <div className="flex justify-end">
        <Link
          href={`/announcements/${id}/detalhes`}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          Ver mais detalhes →
        </Link>
      </div>
    </div>
  );
}
