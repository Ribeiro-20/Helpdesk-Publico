"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Info, Loader2, Tag, X } from "lucide-react";
import { STATUS_BADGE, STATUS_LABEL, cleanAnnouncementText, effectiveStatus, extractProcedurePiecesUrl } from "@/lib/announcements";

interface AnnouncementVersion {
  id: string;
  raw_hash: string;
  changed_at: string;
  change_summary: unknown;
}

interface CpvDisplayItem {
  code: string;
  description: string | null;
}

interface AnnouncementDetail {
  id: string;
  title: string;
  description: string | null;
  entity_name: string | null;
  entity_nif: string | null;
  procedure_type: string | null;
  act_type: string | null;
  contract_type: string | null;
  publication_date: string | null;
  proposal_deadline_days: number | null;
  proposal_deadline_at: string | null;
  base_price: number | null;
  currency: string | null;
  cpv_main: string | null;
  cpv_list: unknown;
  status: string;
  dr_announcement_no: string | null;
  base_announcement_id: string | null;
  source: string | null;
  detail_url: string | null;
  raw_payload: unknown;
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
      <p className={`text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function fmtEur(value: number | null, currency: string | null): string {
  if (value == null) return "-";
  return `${Number(value).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency ?? "EUR"}`;
}

function fmtDate(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-PT");
}

const VERSION_FIELD_LABELS: Record<string, string> = {
  title: "Objeto/título",
  description: "Descrição",
  entity_name: "Entidade adjudicante",
  entity_nif: "NIPC",
  procedure_type: "Tipo de procedimento",
  act_type: "Tipo de ato",
  contract_type: "Tipo de contrato",
  publication_date: "Data de publicação",
  proposal_deadline_days: "Prazo de execução",
  proposal_deadline_at: "Data limite propostas",
  base_price: "Preço base",
  currency: "Moeda",
  cpv_main: "CPV principal",
  cpv_list: "Lista CPV",
  status: "Estado",
  detail_url: "Ligação DR",
  procedure_pieces_url: "Peças do procedimento",
};

const VERSION_TECHNICAL_KEYS = new Set([
  "id",
  "reason",
  "raw_hash",
  "previous_hash",
  "announcement_id",
  "tenant_id",
  "created_at",
  "updated_at",
]);

const VERSION_RELEVANT_FIELDS = new Set([
  "base_price",
  "publication_date",
  "proposal_deadline_days",
  "proposal_deadline_at",
]);

const VERSION_IGNORED_FIELDS = new Set([
  "days_remaining",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type VersionChangeItem = {
  key: string;
  label: string;
  from: string;
  to: string;
};

function formatVersionValue(value: unknown): string {
  if (value == null || value === "") return "Sem valor";

  if (Array.isArray(value)) {
    const text = value
      .map((item) => formatVersionValue(item))
      .filter((item) => item !== "Sem valor")
      .join(", ");

    return text || "Sem valor";
  }

  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return value.toLocaleString("pt-PT");
  if (isRecord(value)) return JSON.stringify(value);

  const text = String(value).trim();
  if (!text) return "Sem valor";

  const parsedDate =
    /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text) ? new Date(text) : null;
  if (parsedDate && !Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toLocaleDateString("pt-PT");
  }

  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function normalizeVersionText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[ºª]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function comparableVersionValue(value: unknown): string {
  if (value == null || value === "") return "";

  if (Array.isArray(value)) {
    return value
      .map((item) => comparableVersionValue(item))
      .filter(Boolean)
      .join("|");
  }

  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (isRecord(value)) return normalizeVersionText(JSON.stringify(value));

  const text = String(value).trim();
  if (!text) return "";

  const parsedDate =
    /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text) ? new Date(text) : null;
  if (parsedDate && !Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return normalizeVersionText(text);
}

function isRelevantVersionField(field: string): boolean {
  return (
    VERSION_RELEVANT_FIELDS.has(field) &&
    !VERSION_TECHNICAL_KEYS.has(field) &&
    !VERSION_IGNORED_FIELDS.has(field)
  );
}

function shouldShowVersionChange(field: string, from: unknown, to: unknown): boolean {
  if (!isRelevantVersionField(field)) {
    return false;
  }

  return comparableVersionValue(from) !== comparableVersionValue(to);
}

function versionChangeItems(summary: unknown): VersionChangeItem[] {
  if (!isRecord(summary) || !Array.isArray(summary.changes)) return [];

  return summary.changes.flatMap((change, index) => {
    if (!isRecord(change) || typeof change.field !== "string") return [];
    const field = change.field;
    if (!shouldShowVersionChange(field, change.from, change.to)) return [];

    return [
      {
        key: `${field}-${index}`,
        label: VERSION_FIELD_LABELS[field] ?? field.replace(/_/g, " "),
        from: formatVersionValue(change.from),
        to: formatVersionValue(change.to),
      },
    ];
  });
}

function versionChangedFields(summary: unknown): string[] {
  if (!isRecord(summary)) return [];

  const hasDetailedChanges = Array.isArray(summary.changes);
  const detailedFields = versionChangeItems(summary).map((item) => item.label);
  if (detailedFields.length > 0) {
    return detailedFields
      .filter((label, index, labels) => labels.indexOf(label) === index)
      .slice(0, 8);
  }

  if (hasDetailedChanges) return [];

  if (Array.isArray(summary.changed_fields)) {
    return summary.changed_fields
      .filter((field): field is string => typeof field === "string")
      .filter((field) => isRelevantVersionField(field))
      .map((field) => VERSION_FIELD_LABELS[field] ?? field.replace(/_/g, " "))
      .filter((label, index, labels) => labels.indexOf(label) === index)
      .slice(0, 8);
  }

  return Object.keys(summary)
    .filter((key) => isRelevantVersionField(key))
    .map((key) => VERSION_FIELD_LABELS[key] ?? key.replace(/_/g, " "))
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .slice(0, 8);
}

function versionTitle(summary: unknown): string {
  const fields = versionChangedFields(summary);
  if (fields.length === 1) return "1 campo atualizado";
  if (fields.length > 1) return `${fields.length} campos atualizados`;

  if (isRecord(summary) && summary.reason === "changed") {
    return "Atualização técnica registada";
  }

  return "Atualização registada";
}

function versionDescription(summary: unknown): string {
  const fields = versionChangedFields(summary);
  if (fields.length > 0) {
    return "Foram identificadas alterações nos dados do anúncio.";
  }

  if (isRecord(summary) && summary.reason === "changed") {
    return "A origem foi consultada novamente, sem alterações relevantes para apresentar.";
  }

  return "Foi guardada uma nova versão deste anúncio para consulta técnica.";
}

function MissingValue({ label = "Dados em atualização" }: { label?: string }) {
  return (
    <span className="group relative inline-flex w-fit items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-sm font-medium text-gray-500">
      <span>{label}</span>
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-gray-500"
        aria-label="Dados ainda nao disponiveis"
      >
        <Info className="h-3 w-3" />
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-[calc(100%+8px)] z-50 w-56 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-xl ring-1 ring-black/5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 whitespace-normal"
      >
        <span className="absolute left-4 -top-1 h-2 w-2 rotate-45 border-l border-t border-gray-200 bg-white" />
        <span className="block text-[10px] font-bold uppercase text-gray-400">INFO</span>
        <span className="mt-1 block text-xs font-normal leading-5 text-gray-700 whitespace-normal break-words">
          Dados em atualização, consulte novamente mais tarde.
        </span>
      </span>
    </span>
  );
}

export default function AnnouncementModal({
  announcementId,
  onClose,
  showSource = true,
  showVersionHistory = true,

}: {
  announcementId: string;
  onClose: () => void;
  showSource?: boolean;
  showVersionHistory?: boolean;
}) {
  const [data, setData] = useState<{
    announcement: AnnouncementDetail;
    versions: AnnouncementVersion[];
    procedure_pieces_url?: string | null;
    cpv?: {
      main: CpvDisplayItem | null;
      list: CpvDisplayItem[];
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);

    const query = showVersionHistory ? "?include_versions=true" : "?include_versions=false";

    fetch(`/api/announcements/${announcementId}${query}`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load announcement");
        return response.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [announcementId, showVersionHistory]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const announcement = data?.announcement;
  const versions = showVersionHistory ? data?.versions ?? [] : [];
  const visibleVersions = showVersionHistory
    ? versions.filter((version) => versionChangedFields(version.change_summary).length > 0)
    : [];
  const cpvMain = data?.cpv?.main ?? null;
  const displayStatus = announcement ? effectiveStatus(announcement) : "active";
  const piecesUrl =
    data?.procedure_pieces_url ??
    (announcement?.raw_payload ? extractProcedurePiecesUrl(announcement.raw_payload) : null);
  const statusClass = STATUS_BADGE[displayStatus] ?? "bg-gray-100 text-gray-600";
  const statusLabel = STATUS_LABEL[displayStatus] ?? displayStatus;
  const drLink = announcement?.detail_url;
  const displayTitle = cleanAnnouncementText(announcement?.title) || "Anúncio sem título";
  const displayDescription = cleanAnnouncementText(announcement?.description) || "-";
  const announcementTypeLabel = cleanAnnouncementText(announcement?.procedure_type ?? announcement?.act_type);
  const contractTypeLabel = cleanAnnouncementText(announcement?.contract_type);
  const entityName = cleanAnnouncementText(announcement?.entity_name);
  const entityDisplay = entityName
    ? announcement?.entity_nif
      ? `${entityName} (${announcement.entity_nif})`
      : entityName
    : null;

  function CpvValue({ item }: { item: CpvDisplayItem }) {
    const description = cleanAnnouncementText(item.description);
    const label = description ? `${item.code} - ${description}` : item.code;
    return (
      <span
        title={label}
        className="inline-flex max-w-full items-start rounded-md bg-blue-50 px-2 py-1 text-sm font-semibold text-sky-800"
      >
        <span className="whitespace-normal break-words">{label}</span>
      </span>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center p-0 sm:items-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative h-screen h-[100dvh] min-h-screen w-screen max-w-none flex flex-col overflow-hidden rounded-none shadow-2xl sm:h-auto sm:min-h-0 sm:w-full sm:max-h-[94vh] sm:max-w-4xl sm:rounded-2xl">
        <div className="shrink-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 pr-14 sm:px-6 sm:pt-5 sm:pb-5 sm:pr-16" style={{ background: "rgba(26, 27, 31, 1)" }}>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "rgba(74, 222, 128, 1)" }}>
            {announcement?.dr_announcement_no ? `Anúncio #${announcement.dr_announcement_no}` : "Anúncio"}
          </p>
          {loading ? (
            <div className="h-6 w-3/4 bg-white/10 rounded animate-pulse" />
          ) : (
            <h2 className="text-white text-base font-bold leading-snug line-clamp-3 sm:text-lg" title={displayTitle}>
              {displayTitle}
            </h2>
          )}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-white px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-6 sm:px-6 sm:py-5">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
              Erro ao carregar o anúncio.
            </div>
          )}

          {!loading && !error && announcement && (
            <>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4" style={{ color: "#3f6f27" }} />
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#3f6f27" }}>
                    Classificação
                  </h3>
                </div>
                <hr className="border-gray-200 mb-4" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                      Tipo de anúncio
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {announcementTypeLabel && (
                        <span className="inline-block text-sm px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                          {announcementTypeLabel}
                        </span>
                      )}
                      {contractTypeLabel && (
                        <span className="inline-block text-sm px-3 py-1 rounded-full border border-teal-200 bg-teal-50 text-teal-700">
                          {contractTypeLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                      Estado
                    </p>
                    <span className={`inline-block text-sm px-3 py-1 rounded-full font-medium ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Preço Base
                  </p>
                  <p className="text-lg font-bold text-green-500 sm:text-xl break-words">
                    {announcement.base_price == null ? (
                      <MissingValue />
                    ) : (
                      fmtEur(announcement.base_price, announcement.currency)
                    )}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    DATA DE PUBLICAÇÃO
                  </p>
                  <p className="text-lg font-medium text-gray-700 sm:text-xl">
                    {announcement.publication_date ? fmtDate(announcement.publication_date) : <MissingValue />}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    DATA LIMITE PROPOSTAS
                  </p>
                  <p className="text-lg font-medium text-gray-700 sm:text-xl">
                    {announcement.proposal_deadline_at ? (
                      fmtDate(announcement.proposal_deadline_at)
                    ) : announcement.proposal_deadline_days != null ? (
                      `${announcement.proposal_deadline_days} dias`
                    ) : (
                      <MissingValue />
                    )}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4" style={{ color: "#3f6f27" }} />
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#3f6f27" }}>
                    Datas
                  </h3>
                </div>
                <hr className="border-gray-200 mb-4" />
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="col-span-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                      PRAZO DE EXECUÇÃO
                    </p>
                    <p className="text-sm text-gray-800">
                      {announcement.proposal_deadline_days != null ? `${announcement.proposal_deadline_days} dias` : <MissingValue />}
                    </p>
                  </div>

                  <div className="col-span-1 sm:col-span-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                      DESCRIÇÃO
                    </p>
                    <p className="text-sm text-gray-800 leading-relaxed line-clamp-6" title={displayDescription}>
                      {displayDescription}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4" style={{ color: "#3f6f27" }} />
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#3f6f27" }}>
                    CPV
                  </h3>
                </div>
                <hr className="border-gray-200 mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoCard title="CPV(s)">
                    {cpvMain ? (
                      <CpvValue item={cpvMain} />
                    ) : announcement.cpv_main ? (
                      <span
                        title={announcement.cpv_main}
                        className="inline-flex max-w-full items-start rounded-md bg-blue-50 px-2 py-1 text-sm font-semibold text-sky-800"
                      >
                        <span className="whitespace-normal break-words">{announcement.cpv_main}</span>
                      </span>
                    ) : (
                      <p className="text-sm">
                        <MissingValue label="CPV em atualizacao" />
                      </p>
                    )}
                  </InfoCard>
                  <InfoCard title="Referências">
                    <Field label="Nº DRE" value={announcement.dr_announcement_no ?? announcement.base_announcement_id} mono />
                    {showSource && <Field label="Fonte" value={announcement.source} />}
                    {showVersionHistory && <Field label="Versões" value={versions.length} />}
                  </InfoCard>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4" style={{ color: "#3f6f27" }} />
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#3f6f27" }}>
                    Entidades
                  </h3>
                </div>
                <hr className="border-gray-200 mb-4" />
                {}
                <div className="w-full">
                  <InfoCard title="Entidade adjudicante">
                    <Field label="ENTIDADE(S) ADJUDICANTE(S)" value={entityDisplay} />
                  </InfoCard>
                </div>
              </div>

              {showVersionHistory && visibleVersions.length > 0 && (
                <InfoCard title={`Histórico de versões (${visibleVersions.length})`}>
                  <div className="space-y-3">
                    {visibleVersions.map((version, index) => {
                      const changedFields = versionChangedFields(version.change_summary);
                      const changeItems = versionChangeItems(version.change_summary);

                      return (
                        <div key={version.id} className="rounded-lg border border-surface-100 bg-white p-3">
                          <div className="flex items-start gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <p className="text-sm font-semibold text-gray-800">
                                  {versionTitle(version.change_summary)}
                                </p>
                                <span className="text-xs text-gray-400">
                                  {new Date(version.changed_at).toLocaleString("pt-PT")}
                                </span>
                              </div>
                              <p className="mt-1 text-xs leading-5 text-gray-500">
                                {versionDescription(version.change_summary)}
                              </p>
                              {changeItems.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  {changeItems.map((item) => (
                                    <div
                                      key={item.key}
                                      className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2"
                                    >
                                      <p className="text-xs font-semibold text-gray-800">{item.label}</p>
                                      <div className="mt-1 grid gap-1 text-xs leading-5 text-gray-600 sm:grid-cols-2">
                                        <p>
                                          <span className="font-semibold text-gray-500">Antes: </span>
                                          {item.from}
                                        </p>
                                        <p>
                                          <span className="font-semibold text-gray-500">Agora: </span>
                                          {item.to}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : changedFields.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {changedFields.map((field) => (
                                    <span
                                      key={field}
                                      className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"
                                    >
                                      {field}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              <p className="mt-2 break-all font-mono text-[11px] text-gray-400">
                                Ref. técnica: {(version.raw_hash as string).slice(0, 12)}...
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </InfoCard>
              )}

              <div className="flex flex-col-reverse items-stretch gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-stretch gap-2 sm:items-center sm:gap-3">
                  {drLink && (
                    <Link
                      href={drLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 sm:w-auto"
                    >
                      Ligação para anúncio no Diário da República →
                    </Link>
                  )}
                  {piecesUrl && (
                    <Link
                      href={piecesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100 sm:w-auto"
                    >
                      Aceda às peças de procedimento
                    </Link>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto"
                >
                  Fechar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
