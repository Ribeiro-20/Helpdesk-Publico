"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Loader2, Tag, X } from "lucide-react";
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

export default function AnnouncementModal({
  announcementId,
  onClose,
  showSource = true,
}: {
  announcementId: string;
  onClose: () => void;
  showSource?: boolean;
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

    fetch(`/api/announcements/${announcementId}`)
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
  }, [announcementId]);

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
  const versions = data?.versions ?? [];
  const cpvMain = data?.cpv?.main ?? null;
  const cpvListDisplay = data?.cpv?.list ?? [];
  const displayStatus = announcement ? effectiveStatus(announcement) : "active";
  const cpvList = Array.isArray(announcement?.cpv_list) ? (announcement!.cpv_list as string[]) : [];
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
  const entityDisplay = announcement?.entity_name
    ? announcement.entity_nif
      ? `${announcement.entity_name} (${announcement.entity_nif})`
      : announcement.entity_name
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl">
        <div className="shrink-0 px-6 pt-5 pb-5 pr-16" style={{ background: "rgba(26, 27, 31, 1)" }}>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#3f6f27" }}>
            {announcement?.dr_announcement_no ? `Anúncio #${announcement.dr_announcement_no}` : "Anúncio"}
          </p>
          {loading ? (
            <div className="h-6 w-3/4 bg-white/10 rounded animate-pulse" />
          ) : (
            <h2 className="text-white text-lg font-bold leading-snug">
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

        <div className="flex-1 overflow-y-auto bg-white px-6 py-5 space-y-6">
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
                <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-3 gap-3">
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Preço Base
                  </p>
                  <p className="text-xl font-bold text-green-500">
                    {fmtEur(announcement.base_price, announcement.currency)}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    DATA DE PUBLICAÇÃO
                  </p>
                  <p className="text-xl font-medium text-gray-700">{fmtDate(announcement.publication_date)}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    DATA LIMITE PROPOSTAS
                  </p>
                  <p className="text-xl font-medium text-gray-700">
                    {announcement.proposal_deadline_at ? fmtDate(announcement.proposal_deadline_at) : (announcement.proposal_deadline_days != null ? `${announcement.proposal_deadline_days} dias` : "-")}
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
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1 whitespace-nowrap">
                      PRAZO
                    </p>
                    <p className="text-sm text-gray-800">
                      {announcement.proposal_deadline_days != null ? `${announcement.proposal_deadline_days} dias` : "-"}
                    </p>
                  </div>

                  <div className="col-span-1 sm:col-span-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1 whitespace-nowrap">
                      DESCRIÇÃO
                    </p>
                    <p className="text-sm text-gray-800 leading-relaxed">
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
                  <InfoCard title="CPV principal">
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
                      <p className="text-sm text-gray-400">Sem CPV identificado no anúncio.</p>
                    )}
                  </InfoCard>
                  <InfoCard title="Referências">
                    <Field label="Nº DR / Base" value={announcement.dr_announcement_no ?? announcement.base_announcement_id} mono />
                    {showSource && <Field label="Fonte" value={announcement.source} />}
                    <Field label="Versões" value={versions.length} />
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

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4" style={{ color: "rgba(74, 222, 128, 1)" }} />
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(74, 222, 128, 1)" }}>
                    Lista CPV
                  </h3>
                </div>
                <hr className="border-gray-200 mb-4" />
                <div className="flex flex-wrap gap-2">
                  {cpvListDisplay.length > 0 ? (
                    cpvListDisplay.map((item) => (
                      <CpvValue key={item.code} item={item} />
                    ))
                  ) : cpvList.length > 0 ? (
                    cpvList.map((code) => (
                      <span
                        key={code}
                        title={code}
                        className="inline-flex max-w-full items-start rounded-md bg-blue-50 px-2 py-1 text-sm font-semibold text-sky-800"
                      >
                        <span className="whitespace-normal break-words">{code}</span>
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-gray-400">Sem lista de CPV identificada no anúncio.</p>
                  )}
                </div>
              </div>

              {versions.length > 0 && (
                <InfoCard title={`Histórico de versões (${versions.length})`}>
                  <div className="space-y-3">
                    {versions.map((version, index) => (
                      <div key={version.id} className="border border-surface-100 rounded-lg p-3">
                        <div className="flex items-center gap-3 mb-1.5">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                            {index + 1}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(version.changed_at).toLocaleString("pt-PT")}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 font-mono break-all">
                          {(version.raw_hash as string).slice(0, 12)}…
                        </p>
                      </div>
                    ))}
                  </div>
                </InfoCard>
              )}

              <div className="flex justify-between items-center gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  {drLink && (
                    <Link
                      href={drLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      Ligação para anúncio no Diário da República →
                    </Link>
                  )}
                  {piecesUrl && (
                    <Link
                      href={piecesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100"
                    >
                      Acesso peças de procedimento
                    </Link>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
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
