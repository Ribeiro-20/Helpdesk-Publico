"use client";

import { useState } from "react";
import Link from "next/link";
import SingleDatePicker from "@/components/SingleDatePicker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cleanAnnouncementText } from "@/lib/announcements";
import { buildHistoryHref, formatNotificationTimestamp } from "@/lib/notification-history";

type Notification = {
  id: string;
  status: string;
  channel: string;
  sent_at: string | null;
  error: string | null;
  created_at: string;
  clients: { name: string; email: string } | null;
  announcements: {
    title: string;
    publication_date: string;
    description?: string;
    detail_url?: string;
    dr_announcement_no?: string | null;
    base_announcement_id?: string | null;
    raw_payload?: unknown;
  } | null;
};

const PRODUCTION_OPPORTUNITIES_URL = "https://mercado.helpdeskpublico.pt/mp/oportunidades-mercado";
const PAGE_SIZE = 25;
const STATUS_OPTIONS = ["", "PENDING", "PROCESSING", "SENT", "FAILED", "SKIPPED", "RATE_LIMITED"];

const STATUS_META: Record<string, { label: string }> = {
  "": { label: "Todos" },
  PENDING: { label: "Pendente" },
  PROCESSING: { label: "Em processamento" },
  SENT: { label: "Enviadas" },
  FAILED: { label: "Falhadas" },
  SKIPPED: { label: "Ignoradas" },
  RATE_LIMITED: { label: "Limitadas" },
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  PROCESSING: "Em processamento",
  SENT: "Enviado",
  FAILED: "Falhado",
  SKIPPED: "Ignorado",
  RATE_LIMITED: "Limitado",
};


export default function EmailHistoryView({
  notifications,
  fromDate,
  toDate,
  minDate,
  maxDate,
  statusFilter,
  search,
  page,
  totalPages,
  totalCount,
}: {
  notifications: Notification[];
  fromDate: string;
  toDate: string;
  minDate: string;
  maxDate: string;
  statusFilter: string;
  search: string;
  page: number;
  totalPages: number;
  totalCount: number;
}) {
  const [draftFromDate, setDraftFromDate] = useState(fromDate);
  const [draftToDate, setDraftToDate] = useState(toDate);

  function historyHref(next: Partial<{
    fromDate: string;
    toDate: string;
    status: string;
    search: string;
    page: number;
  }>) {
    return buildHistoryHref({
      fromDate,
      toDate,
      status: statusFilter,
      search,
      page,
      ...next,
    });
  }

  function getAnnouncementNumber(announcement: Notification["announcements"]): string | null {
    if (!announcement) return null;
    const drNo = announcement.dr_announcement_no?.trim();
    if (drNo) return drNo;
    const baseId = announcement.base_announcement_id?.trim();
    return baseId || null;
  }

  return (
    <div className="space-y-6">
      <form action="/notifications/history" method="get" className="bg-white border border-surface-200 rounded-xl p-6 shadow-card space-y-4">
        <input type="hidden" name="status" value={statusFilter} />
        <input type="hidden" name="from_date" value={draftFromDate} />
        <input type="hidden" name="to_date" value={draftToDate} />

        <div>
          <h2 className="text-sm font-semibold text-gray-900">Histórico de envios</h2>
          <p className="text-gray-400 text-sm mt-1">Registos de envios de emails para rastreabilidade e auditoria.</p>
        </div>

        <div className="space-y-4 border-t border-surface-100 pt-5">
          <div>
            <label htmlFor="history-search" className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-1.5">Pesquisa</label>
            <input
              id="history-search"
              name="q"
              defaultValue={search}
              placeholder="Pesquisar por cliente, anúncio, estado ou erro"
              className="w-full rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((status) => (
                <Link
                  key={status}
                  href={historyHref({ status, page: 1 })}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${statusFilter === status ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-surface-200 hover:bg-surface-50"}`}
                >
                  {STATUS_META[status].label}
                </Link>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Desde</p>
                <SingleDatePicker
                  value={draftFromDate}
                  onChange={setDraftFromDate}
                  placeholder="Data inicial"
                  min={minDate}
                  max={draftToDate || maxDate}
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Até</p>
                <SingleDatePicker
                  value={draftToDate}
                  onChange={setDraftToDate}
                  placeholder="Data final"
                  min={draftFromDate || minDate}
                  max={maxDate}
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                Aplicar filtros
              </button>
              <Link
                href="/notifications/history"
                className="rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-surface-50 hover:text-gray-900"
              >
                Limpar filtros
              </Link>
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-2 text-xs text-gray-600 inline-flex items-center gap-2 shrink-0">
                <span className="font-semibold text-gray-900">{totalCount}</span>
                <span>resultado(s)</span>
              </div>
            </div>
          </div>
        </div>
      </form>

      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-200 bg-white px-5 py-10 text-sm text-gray-500 text-center shadow-card">
            Nenhum envio encontrado com os filtros actuais.
          </div>
        ) : (
          notifications.map((notification) => (
            <details key={notification.id} className="rounded-2xl border border-surface-200 bg-white shadow-card overflow-hidden">
              <summary className="cursor-pointer list-none px-5 py-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between hover:bg-surface-50 transition-colors">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${notification.status === "SENT" ? "bg-brand-600 text-white border-brand-600" : notification.status === "FAILED" ? "bg-red-50 text-red-700 border-red-200" : notification.status === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-600 border-surface-200"}`}>
                      {STATUS_LABEL[notification.status] ?? notification.status}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{notification.clients?.name ?? "—"}</span>
                    <span className="text-xs text-gray-500">{notification.clients?.email ?? ""}</span>
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900 line-clamp-3">
                    {cleanAnnouncementText(notification.announcements?.title) || "—"}
                  </h4>
                  <p className="text-xs text-gray-500">{formatNotificationTimestamp(notification.sent_at ?? notification.created_at)}</p>
                </div>
                <div className="text-xs text-gray-500 md:text-right">
                  <p>{notification.announcements?.publication_date ?? ""}</p>
                  <p className="text-red-500 text-xs">{notification.error ?? ""}</p>
                </div>
              </summary>

              <div className="px-5 pb-5 pt-0 space-y-4 border-t border-surface-100 bg-white">
                <div className="space-y-2">
                  {notification.announcements?.description && (
                    <div className="text-sm text-gray-700 line-clamp-6">{cleanAnnouncementText(notification.announcements.description)}</div>
                  )}
                  {(() => {
                    const announcementNumber = getAnnouncementNumber(notification.announcements);
                    if (!announcementNumber) return null;
                    const href = `${PRODUCTION_OPPORTUNITIES_URL}?announcement_number=${encodeURIComponent(announcementNumber)}`;
                    return <a className="text-sm text-brand-600" href={href} target="_blank" rel="noreferrer">Ver anúncio</a>;
                  })()}
                </div>
                <div className="text-xs bg-brand-50 border border-brand-200 text-brand-800 rounded-xl px-4 py-3 font-mono overflow-auto max-h-56 break-all whitespace-pre-wrap">
                  {JSON.stringify(notification.announcements?.raw_payload ?? { title: notification.announcements?.title ?? null }, null, 2)}
                </div>
              </div>
            </details>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Paginação do histórico de envios" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-card">
          <p className="text-xs text-gray-500">
            A mostrar {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalCount)} de {totalCount}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={historyHref({ page: page - 1 })} className="inline-flex h-9 items-center gap-1 rounded-lg border border-surface-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-50">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-surface-200 px-3 text-sm font-medium text-gray-400 opacity-40"><ChevronLeft className="h-4 w-4" /> Anterior</span>
            )}
            <span className="min-w-20 text-center text-sm text-gray-600">{page} / {totalPages}</span>
            {page < totalPages ? (
              <Link href={historyHref({ page: page + 1 })} className="inline-flex h-9 items-center gap-1 rounded-lg border border-surface-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-50">
                Seguinte <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-surface-200 px-3 text-sm font-medium text-gray-400 opacity-40">Seguinte <ChevronRight className="h-4 w-4" /></span>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
