"use client";

import { useState } from "react";
import Link from "next/link";
import AnnouncementModal from "@/components/AnnouncementModal";
import InfoPopover from "@/components/InfoPopover";
import { STATUS_BADGE, STATUS_LABEL, cleanAnnouncementText, effectiveStatus } from "@/lib/announcements";

export type OpportunityRow = {
  id: string;
  title: string | null;
  entity_name: string | null;
  procedure_type: string | null;
  contract_type: string | null;
  publication_date: string | null;
  proposal_deadline_at: string | null;
  cpv_main: string | null;
  base_price: number | null;
  currency: string | null;
  status: string;
};

type SearchParams = {
  sort?: string;
  limit?: string;
  cpv?: string;
  entity?: string;
  announcement_number?: string;
  act_type: string;
  model: string;
  procedure?: string;
  contract_type?: string;
  min_value?: string;
  max_value?: string;
  from_day?: string;
  from_month?: string;
  from_year?: string;
  to_day?: string;
  to_month?: string;
  to_year?: string;
  from_date?: string;
  to_date?: string;
};

function fmtDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-PT");
}

function fmtMoney(value: number | null, currency: string | null): string {
  if (value == null) return "-";
  const amount = Number(value).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount} ${currency ?? "EUR"}`;
}

function isNearDeadline(value: string | null, hours = 120): boolean {
  if (!value) return false;
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return false;

  const diffMs = deadline.getTime() - Date.now();
  return diffMs >= 0 && diffMs <= hours * 60 * 60 * 1000;
}

function displayProcedureType(value: string | null): string {
  if (!value) return "-";
  return value === "Anuncio de procedimento" ? "Anúncio de procedimento" : value;
}

function buildHref(page: number, params: SearchParams): string {
  const qp = new URLSearchParams();
  if (page > 1) qp.set("page", String(page));
  if (params.sort) qp.set("sort", params.sort);
  if (params.limit) qp.set("limit", params.limit);
  if (params.cpv) qp.set("cpv", params.cpv);
  if (params.entity) qp.set("entity", params.entity);
  if (params.announcement_number) qp.set("announcement_number", params.announcement_number);
  if (params.act_type) qp.set("act_type", params.act_type);
  if (params.model) qp.set("model", params.model);
  if (params.procedure) qp.set("procedure", params.procedure);
  if (params.contract_type) qp.set("contract_type", params.contract_type);
  if (params.min_value) qp.set("min_value", params.min_value);
  if (params.max_value) qp.set("max_value", params.max_value);
  if (params.from_day) qp.set("from_day", params.from_day);
  if (params.from_month) qp.set("from_month", params.from_month);
  if (params.from_year) qp.set("from_year", params.from_year);
  if (params.to_day) qp.set("to_day", params.to_day);
  if (params.to_month) qp.set("to_month", params.to_month);
  if (params.to_year) qp.set("to_year", params.to_year);
  if (params.from_date) qp.set("from_date", params.from_date);
  if (params.to_date) qp.set("to_date", params.to_date);
  const query = qp.toString();
  return `/oportunidades${query ? `?${query}` : ""}`;
}

export default function OportunidadesResults({
  opportunities,
  page,
  totalPages,
  filters,
  hasFilters,
}: {
  opportunities: OpportunityRow[];
  page: number;
  totalPages: number;
  filters: SearchParams;
  hasFilters: boolean;
}) {
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null);

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">OBJETO DO CONTRATO</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">ADJUDICANTE(S)</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">DATA PUBLICAÇÃO</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">DATA LIMITE</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    CPV
                    <InfoPopover text="Passe o rato por cima do codigo CPV para ver contexto." />
                  </span>
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Valor</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {opportunities.map((op) => {
                const displayStatus = effectiveStatus(op);
                const statusLabel = STATUS_LABEL[displayStatus] ?? displayStatus;
                const statusClass = STATUS_BADGE[displayStatus] ?? "bg-gray-100 text-gray-600";
                const nearDeadline = isNearDeadline(op.proposal_deadline_at);
                const title = cleanAnnouncementText(op.title) || "Sem título";
                const entityName = cleanAnnouncementText(op.entity_name) || "-";
                const procedureType = cleanAnnouncementText(displayProcedureType(op.procedure_type)) || "-";

                return (
                  <tr
                    key={op.id}
                    className="hover:bg-green-50/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedAnnouncementId(op.id)}
                  >
                    <td className="px-4 py-3 max-w-xs align-top">
                      <p className="text-gray-900 font-medium line-clamp-2">{op.title ?? "Sem titulo"}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{op.procedure_type ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] text-xs leading-normal align-top">{entityName}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs tabular-nums align-top">{fmtDate(op.publication_date)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs tabular-nums align-top">
                      <span>{fmtDate(op.proposal_deadline_at)}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {op.cpv_main ? (
                        <span className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono whitespace-nowrap">{op.cpv_main}</span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap align-top">
                      <span className="text-gray-900 font-medium text-xs">{fmtMoney(op.base_price, op.currency)}</span>
                    </td>
                    <td className="px-4 py-3 text-center align-top">
                      {nearDeadline ? (
                        <span className="inline-block text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                          Próx. fim
                        </span>
                      ) : (
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${statusClass}`}>
                          {statusLabel}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {opportunities.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                    Sem oportunidades para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-1 flex-wrap pb-4">
          {page > 1 && (
            <Link
              href={buildHref(page - 1, filters)}
              className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              ← Anterior
            </Link>
          )}

          <span
            className="px-3 py-1.5 text-sm font-medium rounded-md text-white"
            style={{ background: "#3f6f27" }}
          >
            {page} / {totalPages}
          </span>

          {page < totalPages && (
            <Link
              href={buildHref(page + 1, filters)}
              className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              Proxima →
            </Link>
          )}
        </div>
      )}

      {selectedAnnouncementId && (
        <AnnouncementModal
          announcementId={selectedAnnouncementId}
          onClose={() => setSelectedAnnouncementId(null)}
          showSource={false}
        />
      )}
    </>
  );
}
