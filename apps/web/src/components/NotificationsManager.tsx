"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cleanAnnouncementText } from "@/lib/announcements";
import {
  CircleAlert,
  CircleCheckBig,
  CircleX,
  Clock3,
  Inbox,
  Send,
  TriangleAlert,
  Mail,
  Trash2,
} from "lucide-react";

type Notification = {
  id: string;
  status: string;
  channel: string;
  sent_at: string | null;
  error: string | null;
  created_at: string;
  clients: { name: string; email: string } | null;
  announcements: { title: string; publication_date: string } | null;
};

const STATUS_OPTIONS = [
  "",
  "PENDING",
  "SENT",
  "FAILED",
  "SKIPPED",
  "RATE_LIMITED",
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  SENT: "bg-brand-100 text-brand-700",
  FAILED: "bg-red-100 text-red-700",
  SKIPPED: "bg-gray-100 text-gray-500",
  RATE_LIMITED: "bg-orange-100 text-orange-700",
};

const STATUS_META: Record<string, { label: string; icon: typeof Inbox }> = {
  "": { label: "Todos", icon: Inbox },
  PENDING: { label: "Pendente", icon: Clock3 },
  SENT: { label: "Enviadas", icon: CircleCheckBig },
  FAILED: { label: "Falhadas", icon: CircleX },
  SKIPPED: { label: "Ignoradas", icon: CircleAlert },
  RATE_LIMITED: { label: "Limitadas", icon: TriangleAlert },
};

const STATUS_BADGE_META: Record<string, { icon: typeof Inbox }> = {
  PENDING: { icon: Clock3 },
  SENT: { icon: CircleCheckBig },
  FAILED: { icon: CircleX },
  SKIPPED: { icon: CircleAlert },
  RATE_LIMITED: { icon: TriangleAlert },
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  SENT: "Enviado",
  FAILED: "Falhado",
  SKIPPED: "Ignorado",
  RATE_LIMITED: "Limitado",
};

export default function NotificationsManager({
  notifications: initial,
  statusFilter,
  page,
  totalPages,
  canManage,
}: {
  notifications: Notification[];
  statusFilter: string;
  page: number;
  totalPages: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [resending, setResending] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(initial);

  const visibleNotifications = useMemo(() => {
    return (notifications ?? []).filter((n) => {
      if (statusFilter) {
        const ns = (n.status ?? "").toString().trim().toUpperCase();
        const fs = (statusFilter ?? "").toString().trim().toUpperCase();
        if (fs !== "" && ns !== fs) return false;
      }
      return true;
    });
  }, [notifications, statusFilter]);

  async function resend(id: string) {
    setResending(id);
    setError(null);
    const { data, error: updateError } = await supabase
      .from("notifications")
      .update({
        status: "PENDING",
        error: null,
        sent_at: null,
        scheduled_for: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    setResending(null);

    if (updateError || !data) {
      setError(updateError?.message ?? "Nao foi possivel reenviar a notificacao.");
      return;
    }

    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, status: "PENDING", error: null, sent_at: null } : n,
      ),
    );
    router.refresh();
  }

  async function deleteNotification(id: string) {
    if (!confirm("Apagar esta notificacao? O historico de emails sera preservado.")) return;

    setDeleting(id);
    setError(null);
    const { data, error: deleteError } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    setDeleting(null);

    if (deleteError || !data) {
      setError(deleteError?.message ?? "Nao foi possivel apagar a notificacao.");
      return;
    }

    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {STATUS_OPTIONS.map((s) => (
            <Link
              key={s}
              href={`/notifications?status=${s}&page=1`}
              className={`inline-flex shrink-0 items-center gap-2 text-sm px-3.5 py-1.5 rounded-xl font-medium transition-all ${
                statusFilter === s
                  ? "bg-brand-600 text-white shadow-sm"
                  : s === ""
                  ? "bg-white border border-surface-200 text-brand-600 hover:bg-surface-50 hover:text-brand-700 shadow-card"
                  : "bg-white border border-surface-200 text-gray-500 hover:bg-surface-50 hover:text-gray-700 shadow-card"
              }`}
            >
              {(() => {
                const meta = STATUS_META[s];
                const Icon = meta.icon;
                return <Icon className="h-4 w-4 shrink-0" />;
              })()}
              <span>{STATUS_META[s].label}</span>
            </Link>
          ))}
        </div>

        <div className="shrink-0 sm:ml-4">
          <Link
            href="/notifications/history"
            className="inline-flex w-full items-center justify-center gap-2 text-sm px-3.5 py-1.5 rounded-xl font-medium bg-brand-600 text-white shadow-sm sm:w-auto"
          >
            <Mail className="h-4 w-4" />
            Histórico de envios
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Cliente
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Anúncio
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Estado
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Data
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 text-xs uppercase tracking-wider">
                  Erro
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {visibleNotifications.map((n) => {
                const client = n.clients as {
                  name: string;
                  email: string;
                } | null;
                const ann = n.announcements as {
                  title: string;
                  publication_date: string;
                } | null;
                const announcementTitle = cleanAnnouncementText(ann?.title) || "—";

                return (
                  <tr key={n.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">
                        {client?.name ?? "—"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {client?.email ?? ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-gray-700 truncate">
                        {announcementTitle}
                      </p>
                      <p className="text-xs text-gray-400">
                        {ann?.publication_date ?? ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[n.status] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {(() => {
                            const meta = STATUS_BADGE_META[n.status];
                            const Icon = meta?.icon;
                            return Icon ? <Icon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> : null;
                          })()}
                          {STATUS_LABEL[n.status] ?? n.status}
                        </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {n.sent_at
                        ? new Date(n.sent_at).toLocaleString("pt-PT")
                        : new Date(n.created_at).toLocaleString("pt-PT")}
                    </td>
                    <td className="px-4 py-3 text-xs text-red-500 max-w-[150px] truncate">
                      {n.error ?? ""}
                    </td>
                    <td className="px-4 py-3">
                      {canManage && (
                        <div className="flex items-center justify-end gap-2">
                          {(n.status === "FAILED" || n.status === "PENDING") && (
                            <button
                              onClick={() => resend(n.id)}
                              disabled={resending === n.id || deleting === n.id}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 border border-brand-200 px-2.5 py-1 rounded-lg transition-all disabled:opacity-50"
                            >
                              <Send className="h-3.5 w-3.5" />
                              {resending === n.id ? "A enviar" : "Reenviar"}
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(n.id)}
                            disabled={deleting === n.id || resending === n.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg transition-all disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deleting === n.id ? "A apagar" : "Apagar"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleNotifications.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    Nenhuma notificação encontrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/notifications?status=${statusFilter}&page=${page - 1}`}
              className="px-3.5 py-1.5 text-sm font-medium bg-white border border-surface-200 rounded-xl hover:bg-surface-50 shadow-card transition-all"
            >
              Anterior
            </Link>
          )}
          <span className="px-3.5 py-1.5 text-sm text-gray-400">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/notifications?status=${statusFilter}&page=${page + 1}`}
              className="px-3.5 py-1.5 text-sm font-medium bg-white border border-surface-200 rounded-xl hover:bg-surface-50 shadow-card transition-all"
            >
              Próxima
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
