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
  proposal_deadline_days: number | null;
  proposal_deadline_at: string | null;
  cpv_main: string | null;
  cpv_list: string[] | null;
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

function fmtDeadline(value: string | null, days: number | null): string | null {
  if (value) return fmtDate(value);
  if (days != null) return `${days} dias`;
  return null;
}

function fmtMoney(value: number | null, currency: string | null): string {
  if (value == null) return "-";
  const amount = Number(value).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount} ${currency ?? "EUR"}`;
}

function MissingInfo({
  placement = "bottom",
  side = "right",
}: {
  placement?: "side" | "bottom";
  side?: "left" | "right";
}) {
  return (
    <span className="inline-flex items-center justify-center text-xs text-gray-400">
      <InfoPopover
        text="Dados em atualização. Por favor, tente novamente mais tarde ou consulte o Diário da República "
        ariaLabel="Dados ainda nao disponiveis"
        placement={placement}
        side={side}
      />
    </span>
  );
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
  cpvDescriptions,
  page,
  totalPages,
  filters,
  hasFilters,
}: {
  opportunities: OpportunityRow[];
  cpvDescriptions: Record<string, string>;
  page: number;
  totalPages: number;
  filters: SearchParams;
  hasFilters: boolean;
}) {
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null);

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="space-y-2 p-2 lg:hidden">
          {opportunities.map((op) => {
            const displayStatus = effectiveStatus(op);
            const statusLabel = STATUS_LABEL[displayStatus] ?? displayStatus;
            const statusClass = STATUS_BADGE[displayStatus] ?? "bg-gray-100 text-gray-600";
            const nearDeadline = isNearDeadline(op.proposal_deadline_at);
            const title = cleanAnnouncementText(op.title) || "Sem título";
            const entityName = cleanAnnouncementText(op.entity_name) || "-";
            const procedureType = cleanAnnouncementText(displayProcedureType(op.procedure_type)) || "-";
            const cpvTitle = op.cpv_main
              ? cpvDescriptions[op.cpv_main] || "Descrição de CPV indisponível"
              : undefined;

            return (
              <button
                key={op.id}
                type="button"
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-left shadow-sm transition-colors hover:bg-green-50/40"
                onClick={() => setSelectedAnnouncementId(op.id)}
              >
                <div className="mb-1 flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-green-700 line-clamp-2">{title}</p>
                  {nearDeadline ? (
                    <span className="inline-block shrink-0 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                      Próx. fim
                    </span>
                  ) : (
                    <span className={`inline-block shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusClass}`}>
                      {statusLabel}
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-500 line-clamp-1">{procedureType}</p>
                <p className="mt-0.5 text-xs text-gray-600 line-clamp-1">{entityName}</p>

                <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Publicação</p>
                    <p className="mt-0.5 text-gray-700">
                      {op.publication_date ? fmtDate(op.publication_date) : <MissingInfo placement="bottom" side="left" />}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Data limite</p>
                    <p className="mt-0.5 text-gray-700">
                      {op.proposal_deadline_at ? fmtDate(op.proposal_deadline_at) : <MissingInfo placement="bottom" side="left" />}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">CPV</p>
                    <p className="mt-0.5">
                      {op.cpv_main ? (
                        <span
                          title={cpvTitle}
                          className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono whitespace-nowrap"
                        >
                          {op.cpv_main}
                        </span>
                      ) : (
                        <MissingInfo placement="bottom" side="left" />
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Valor</p>
                    <p className="mt-0.5 font-medium text-gray-900">
                      {op.base_price == null ? <MissingInfo placement="bottom" side="left" /> : fmtMoney(op.base_price, op.currency)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}

          {opportunities.length === 0 && (
            <div className="px-4 py-14 text-center text-gray-400 text-sm">
              Sem oportunidades para os filtros selecionados.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto lg:block">
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
                const displayDeadline = fmtDeadline(op.proposal_deadline_at, op.proposal_deadline_days);
                const displayCpv = op.cpv_main || (Array.isArray(op.cpv_list) ? op.cpv_list[0] : null);
                const cpvTitle = displayCpv
                  ? cpvDescriptions[displayCpv] || "Descricao de CPV indisponivel"
                  : undefined;

                return (
                  <tr
                    key={op.id}
                    className="hover:bg-green-50/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedAnnouncementId(op.id)}
                  >
                    <td className="px-4 py-3 max-w-xs align-top">
                      <p className="text-green-600 font-medium line-clamp-2">{title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{procedureType}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] text-xs leading-normal align-top">{entityName}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs tabular-nums align-top">
                      {op.publication_date ? fmtDate(op.publication_date) : <MissingInfo />}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs tabular-nums align-top">
                      {displayDeadline ? <span>{displayDeadline}</span> : <MissingInfo placement="side" side="left" />}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {displayCpv ? (
                        <span
                          title={cpvTitle}
                          className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono whitespace-nowrap"
                        >
                          {displayCpv}
                        </span>
                      ) : (
                        <MissingInfo placement="side" side="left" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap align-top">
                      {op.base_price == null ? (
                        <MissingInfo placement="side" side="left" />
                      ) : (
                        <span className="text-gray-900 font-medium text-xs">{fmtMoney(op.base_price, op.currency)}</span>
                      )}
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
        <div className="flex justify-center items-center gap-1.5 flex-wrap pb-4 px-1">
          {page > 1 && (
            <Link
              href={buildHref(page - 1, filters)}
              className="px-3 py-2 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              ← Anterior
            </Link>
          )}

          <span
            className="px-3 py-2 text-sm font-medium rounded-xl text-gray-900"
            style={{ background: "rgba(74, 222, 128, 1)" }}
          >
            {page} / {totalPages}
          </span>

          {page < totalPages && (
            <Link
              href={buildHref(page + 1, filters)}
              className="px-3 py-2 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              Próxima →
            </Link>
          )}
        </div>
      )}

      {selectedAnnouncementId && (
        <AnnouncementModal
          announcementId={selectedAnnouncementId}
          onClose={() => setSelectedAnnouncementId(null)}
          showSource={false}
          showVersionHistory={false}
        />
      )}
    </>
  );
}
