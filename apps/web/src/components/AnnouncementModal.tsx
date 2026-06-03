"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Loader2, Tag, X } from "lucide-react";
import { STATUS_BADGE, STATUS_LABEL, effectiveStatus } from "@/lib/announcements";

interface AnnouncementVersion {
  id: string;
  raw_hash: string;
  changed_at: string;
  change_summary: unknown;
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

function extractUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const direct = record.detail_url ?? record.detailUrl ?? record.url;
  if (typeof direct === "string" && direct.trim()) return direct;
  const nested = record.payload;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    const nestedUrl = nestedRecord.detail_url ?? nestedRecord.detailUrl ?? nestedRecord.url;
    if (typeof nestedUrl === "string" && nestedUrl.trim()) return nestedUrl;
  }
  return null;
}

export default function AnnouncementModal({
  announcementId,
  onClose,
}: {
  announcementId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    announcement: AnnouncementDetail;
    versions: AnnouncementVersion[];
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
  const displayStatus = announcement ? effectiveStatus(announcement) : "active";
  const cpvList = Array.isArray(announcement?.cpv_list) ? (announcement!.cpv_list as string[]) : [];
  const piecesUrl = announcement?.raw_payload ? extractUrl(announcement.raw_payload) : null;
  const statusClass = STATUS_BADGE[displayStatus] ?? "bg-gray-100 text-gray-600";
  const statusLabel = STATUS_LABEL[displayStatus] ?? displayStatus;
  const primaryLink = announcement?.detail_url ?? piecesUrl;

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
          <p className="text-xs font-semibold mb-1.5" style={{ color: "rgba(74, 222, 128, 1)" }}>
            {announcement?.dr_announcement_no ? `Anúncio #${announcement.dr_announcement_no}` : "Anúncio"}
          </p>
          {loading ? (
            <div className="h-6 w-3/4 bg-white/10 rounded animate-pulse" />
          ) : (
            <h2 className="text-white text-lg font-bold leading-snug">
              {announcement?.title || "Anúncio sem título"}
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
                  <Tag className="w-4 h-4" style={{ color: "rgba(74, 222, 128, 1)" }} />
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(74, 222, 128, 1)" }}>
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
                      {announcement.act_type && (
                        <span className="inline-block text-sm px-3 py-1 rounded-full border border-purple-200 bg-purple-50 text-purple-700">
                          {announcement.act_type}
                        </span>
                      )}
                      {announcement.procedure_type && (
                        <span className="inline-block text-sm px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                          {announcement.procedure_type}
                        </span>
                      )}
                      {announcement.contract_type && (
                        <span className="inline-block text-sm px-3 py-1 rounded-full border border-teal-200 bg-teal-50 text-teal-700">
                          {announcement.contract_type}
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
                    Publicação
                  </p>
                  <p className="text-xl font-medium text-gray-700">{fmtDate(announcement.publication_date)}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Data limite
                  </p>
                  <p className="text-xl font-medium text-gray-700">
                    {announcement.proposal_deadline_at ? fmtDate(announcement.proposal_deadline_at) : (announcement.proposal_deadline_days != null ? `${announcement.proposal_deadline_days} dias` : "-")}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4" style={{ color: "rgba(74, 222, 128, 1)" }} />
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(74, 222, 128, 1)" }}>
                    Datas
                  </h3>
                </div>
                <hr className="border-gray-200 mb-4" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                      Publicação
                    </p>
                    <p className="text-sm text-gray-800">{fmtDate(announcement.publication_date)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                      Prazo (dias)
                    </p>
                    <p className="text-sm text-gray-800">{announcement.proposal_deadline_days != null ? `${announcement.proposal_deadline_days} dias` : "-"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                      Data limite
                    </p>
                    <p className="text-sm text-gray-800">{fmtDate(announcement.proposal_deadline_at)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                      Fonte
                    </p>
                    <p className="text-sm text-gray-800">{announcement.source ?? "-"}</p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4" style={{ color: "rgba(74, 222, 128, 1)" }} />
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(74, 222, 128, 1)" }}>
                    CPV
                  </h3>
                </div>
                <hr className="border-gray-200 mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoCard title="CPV principal">
                    <Field label="CPV principal" value={announcement.cpv_main} mono />
                    {cpvList.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Lista CPV</p>
                        <div className="flex flex-wrap gap-1">
                          {cpvList.map((code) => (
                            <span key={code} className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono">
                              {code}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {!announcement.cpv_main && cpvList.length === 0 && (
                      <p className="text-sm text-gray-400">Sem CPV identificado no anúncio.</p>
                    )}
                  </InfoCard>

                  <InfoCard title="Referências">
                    <Field label="Nº DR / Base" value={announcement.dr_announcement_no ?? announcement.base_announcement_id} mono />
                    <Field label="Fonte" value={announcement.source} />
                    <Field label="Versões" value={versions.length} />
                    {piecesUrl && (
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Peças do procedimento</p>
                        <a href={piecesUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline text-sm break-all">
                          {piecesUrl}
                        </a>
                      </div>
                    )}
                  </InfoCard>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4" style={{ color: "rgba(74, 222, 128, 1)" }} />
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(74, 222, 128, 1)" }}>
                    Entidades
                  </h3>
                </div>
                <hr className="border-gray-200 mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoCard title="Entidade adjudicante">
                    <Field label="Entidade" value={announcement.entity_name} />
                    <Field label="NIPC" value={announcement.entity_nif} mono />
                  </InfoCard>

                  <InfoCard title="Estado do anúncio">
                    <Field label="Estado" value={statusLabel} />
                    <Field label="Tipo de procedimento" value={announcement.procedure_type} />
                    <Field label="Tipo de anúncio" value={announcement.act_type} />
                    <Field label="Tipo de contrato" value={announcement.contract_type} />
                  </InfoCard>
                </div>
              </div>

              {announcement.description && (
                <InfoCard title="Descrição">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {announcement.description}
                  </p>
                </InfoCard>
              )}

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
                {primaryLink ? (
                  <Link
                    href={primaryLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                  >
                    Ver no anúncio original →
                  </Link>
                ) : (
                  <span />
                )}
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
