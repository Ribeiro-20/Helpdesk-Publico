"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

export default function NotificationsManager({
  notifications: initial,
  statusFilter,
  page,
  totalPages,
}: {
  notifications: Notification[];
  statusFilter: string;
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [resending, setResending] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(initial);

  async function resend(id: string) {
    setResending(id);
    await supabase
      .from("notifications")
      .update({ status: "PENDING", error: null, sent_at: null })
      .eq("id", id);
    setResending(null);
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, status: "PENDING", error: null, sent_at: null } : n,
      ),
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <Link
            key={s}
            href={`/notifications?status=${s}&page=1`}
            className={`text-sm px-3.5 py-1.5 rounded-xl font-medium transition-all ${
              statusFilter === s
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-white border border-surface-200 text-gray-500 hover:bg-surface-50 hover:text-gray-700 shadow-card"
            }`}
          >
            {s || "Todos"}
          </Link>
        ))}
      </div>

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
                  Anuncio
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
              {notifications.map((n) => {
                const client = n.clients as {
                  name: string;
                  email: string;
                } | null;
                const ann = n.announcements as {
                  title: string;
                  publication_date: string;
                } | null;

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
                        {ann?.title ?? "—"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {ann?.publication_date ?? ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[n.status] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {n.status}
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
                      {(n.status === "FAILED" || n.status === "PENDING") && (
                        <button
                          onClick={() => resend(n.id)}
                          disabled={resending === n.id}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 border border-brand-200 px-2.5 py-1 rounded-lg transition-all disabled:opacity-50"
                        >
                          {resending === n.id ? "..." : "Reenviar"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {notifications.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    Nenhuma notificacao encontrada
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
              Proxima
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
