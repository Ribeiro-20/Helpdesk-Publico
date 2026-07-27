"use client";

import { useEffect, useMemo, useState } from "react";
import SingleDatePicker from "@/components/SingleDatePicker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cleanAnnouncementText } from "@/lib/announcements";

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
const LISBON_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const STATUS_OPTIONS = ["", "PENDING", "SENT", "FAILED", "SKIPPED", "RATE_LIMITED"];

const STATUS_META: Record<string, { label: string }> = {
  "": { label: "Todos" },
  PENDING: { label: "Pendente" },
  SENT: { label: "Enviadas" },
  FAILED: { label: "Falhadas" },
  SKIPPED: { label: "Ignoradas" },
  RATE_LIMITED: { label: "Limitadas" },
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  SENT: "Enviado",
  FAILED: "Falhado",
  SKIPPED: "Ignorado",
  RATE_LIMITED: "Limitado",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  SENT: "bg-brand-100 text-brand-700",
  FAILED: "bg-red-100 text-red-700",
  SKIPPED: "bg-gray-100 text-gray-500",
  RATE_LIMITED: "bg-orange-100 text-orange-700",
};

function formatTimestamp(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-PT");
}

function getLisbonDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = LISBON_DATE_FORMATTER.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${read("year")}-${read("month")}-${read("day")}`;
}

export default function EmailHistoryView({
  notifications: initial,
  weekStart,
  weekEnd,
}: {
  notifications: Notification[];
  weekStart: string;
  weekEnd: string;
}) {
  const [filter, setFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return (initial ?? []).filter((n) => {
      if (filter) {
        const ns = (n.status ?? "").toString().trim().toUpperCase();
        const fs = (filter ?? "").toString().trim().toUpperCase();
        if (fs !== "" && ns !== fs) return false;
      }

      const ts = n.sent_at ?? n.created_at;
      const date = getLisbonDate(ts);
      if (fromDate) {
        if (!date || date < fromDate) return false;
      }
      if (toDate) {
        if (!date || date > toDate) return false;
      }

      if (!search) return true;
      const low = search.toLowerCase();
      const client = n.clients?.name ?? n.clients?.email ?? "";
      const annTitle = cleanAnnouncementText(n.announcements?.title);
      const annDesc = typeof n.announcements?.description === "string" ? cleanAnnouncementText(n.announcements.description) : JSON.stringify(n.announcements?.raw_payload ?? "");
      return [client, annTitle, annDesc, n.error ?? "", n.status].join(" ").toLowerCase().includes(low);
    });
  }, [initial, filter, fromDate, toDate, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [filter, fromDate, toDate, search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function clearFilters() {
    setFilter("");
    setFromDate("");
    setToDate("");
    setSearch("");
    setPage(1);
  }

  function getAnnouncementNumber(announcement: Notification["announcements"]): string | null {
    if (!announcement) return null;
    const drNo = announcement.dr_announcement_no?.trim();
    if (drNo) return drNo;
    const baseId = announcement.base_announcement_id?.trim();
    if (baseId) return baseId;
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Histórico de envios</h2>
          <p className="text-gray-400 text-sm mt-1">Registos de envios de emails para rastreabilidade e auditoria.</p>
        </div>

        <div className="space-y-4 border-t border-surface-100 pt-5">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-1.5">Pesquisa</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Pesquisar por cliente, anúncio, estado ou erro'
              className="w-full rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${filter === s ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-surface-200 hover:bg-surface-50"}`}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-3">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Desde</p>
                <SingleDatePicker
                  value={fromDate}
                  onChange={setFromDate}
                  placeholder="Data inicial"
                  min={weekStart}
                  max={toDate || weekEnd}
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Até</p>
                <SingleDatePicker
                  value={toDate}
                  onChange={setToDate}
                  placeholder="Data final"
                  min={fromDate || weekStart}
                  max={weekEnd}
                />
              </div>
              <div>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-surface-50 hover:text-gray-900"
                >
                  Limpar filtros
                </button>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-2 text-xs text-gray-600 inline-flex items-center gap-2 shrink-0">
                <span className="font-semibold text-gray-900">{filtered.length}</span>
                <span>resultado(s)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-200 bg-white px-5 py-10 text-sm text-gray-500 text-center shadow-card">
            Nenhum envio encontrado com os filtros atuais.
          </div>
        ) : (
          paginated.map((n) => (
            <details key={n.id} className="rounded-2xl border border-surface-200 bg-white shadow-card overflow-hidden">
              <summary className="cursor-pointer list-none px-5 py-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between hover:bg-surface-50 transition-colors">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${n.status === "SENT" ? "bg-brand-600 text-white border-brand-600" : n.status === "FAILED" ? "bg-red-50 text-red-700 border-red-200" : n.status === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-600 border-surface-200"}`}>
                      {STATUS_LABEL[n.status] ?? n.status}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{n.clients?.name ?? "—"}</span>
                    <span className="text-xs text-gray-500">{n.clients?.email ?? ""}</span>
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900 line-clamp-3">
                    {cleanAnnouncementText(n.announcements?.title) || "—"}
                  </h4>
                  <p className="text-xs text-gray-500">{formatTimestamp(n.sent_at ?? n.created_at)}</p>
                </div>

                <div className="text-xs text-gray-500 md:text-right">
                  <p>{n.announcements?.publication_date ?? ""}</p>
                  <p className="text-red-500 text-xs">{n.error ?? ""}</p>
                </div>
              </summary>

              <div className="px-5 pb-5 pt-0 space-y-4 border-t border-surface-100 bg-white">
                <div className="space-y-2">
                  {n.announcements?.description && (
                    <div className="text-sm text-gray-700 line-clamp-6">{cleanAnnouncementText(n.announcements.description)}</div>
                  )}

                  {(() => {
                    const announcementNumber = getAnnouncementNumber(n.announcements);
                    if (!announcementNumber) return null;
                    const href = `${PRODUCTION_OPPORTUNITIES_URL}?announcement_number=${encodeURIComponent(announcementNumber)}`;
                    return (
                      <a className="text-sm text-brand-600" href={href} target="_blank" rel="noreferrer">
                        Ver anúncio
                      </a>
                    );
                  })()}
                </div>

                <div className="text-xs bg-brand-50 border border-brand-200 text-brand-800 rounded-xl px-4 py-3 font-mono overflow-auto max-h-56 break-all whitespace-pre-wrap">
                  {JSON.stringify(n.announcements?.raw_payload ?? { title: n.announcements?.title ?? null }, null, 2)}
                </div>
              </div>
            </details>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Paginação do histórico de envios"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-card"
        >
          <p className="text-xs text-gray-500">
            A mostrar {(safePage - 1) * PAGE_SIZE + 1}-
            {Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage === 1}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-surface-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Anterior
            </button>

            <span className="min-w-20 text-center text-sm text-gray-600">
              {safePage} / {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage === totalPages}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-surface-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Seguinte
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
