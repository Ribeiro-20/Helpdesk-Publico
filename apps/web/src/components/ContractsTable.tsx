"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ContractModal from "./ContractModal";
import InfoPopover from "./InfoPopover";

export interface ContractRow {
  id: string;
  object: string | null;
  procedure_type: string | null;
  contract_type?: string | null;
  signing_date: string | null;
  execution_deadline_days?: number | null;
  execution_locations?: string[];
  cpv_main: string | null;
  contract_price: number | null;
  base_price: number | null;
  status: string;
  contracting_entities: string[];
  winners: string[];
}

function formatEur(val: number | null): string {
  if (val == null) return "—";
  return (
    val.toLocaleString("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function executionProgress(
  signingDate: string | null,
  deadlineDays: number | null | undefined,
): number | null {
  if (!signingDate || !deadlineDays || deadlineDays <= 0) return null;

  const start = new Date(`${signingDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;

  const elapsedMs = Date.now() - start.getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  return (elapsedDays / deadlineDays) * 100;
}

function resolveStatusBadge(contract: ContractRow): {
  label: string;
  className: string;
  title?: string;
} {
  if (contract.status === "closed") {
    return { label: "Fechado", className: "bg-gray-100 text-gray-600" };
  }

  if (contract.status === "modified") {
    return { label: "Modificado", className: "bg-amber-100 text-amber-700" };
  }

  if (contract.status === "active") {
    const progress = executionProgress(
      contract.signing_date,
      contract.execution_deadline_days,
    );

    if (progress != null && progress >= 100) {
      return {
        label: "Prazo excedido",
        className: "bg-red-100 text-red-700",
        title: `${progress.toFixed(0)}% do prazo de execucao`,
      };
    }

    if (progress != null && progress >= 80) {
      return {
        label: "Aproxima prazo",
        className: "bg-amber-100 text-amber-700",
        title: `${progress.toFixed(0)}% do prazo de execucao`,
      };
    }

    return { label: "Activo", className: "bg-green-100 text-green-700" };
  }

  return {
    label: contract.status || "Desconhecido",
    className: "bg-gray-100 text-gray-600",
  };
}

function extractName(raw: string): string {
  const idx = raw.indexOf(" - ");
  return idx === -1 ? raw : raw.slice(idx + 3);
}

export default function ContractsTable({
  contracts,
  hasFilters,
  totalPages,
  page,
  buildQsBase,
}: {
  contracts: ContractRow[];
  hasFilters: boolean;
  totalPages: number;
  page: number;
  buildQsBase: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cpvDescriptions, setCpvDescriptions] = useState<
    Record<string, string>
  >({});
  const supabase = createClient();

  const cpvCodesOnPage = useMemo(
    () =>
      Array.from(
        new Set(contracts.map((c) => c.cpv_main).filter(Boolean) as string[]),
      ),
    [contracts],
  );

  useEffect(() => {
    if (cpvCodesOnPage.length === 0) return;

    const missing = cpvCodesOnPage.filter((code) => !cpvDescriptions[code]);
    if (missing.length === 0) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("cpv_codes")
        .select("id, descricao")
        .in("id", missing);

      if (cancelled || error || !data) return;

      const mapped: Record<string, string> = {};
      for (const row of data as Array<{ id: string; descricao: string }>) {
        if (row.id) mapped[row.id] = row.descricao ?? "";
      }

      if (Object.keys(mapped).length > 0) {
        setCpvDescriptions((prev) => ({ ...prev, ...mapped }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cpvCodesOnPage, cpvDescriptions, supabase]);

  function buildQs(p: number) {
    const url = new URL(buildQsBase, "http://x");
    url.searchParams.set("page", String(p));
    return `/mercado-publico?${url.searchParams.toString()}`;
  }

  const BTN =
    "px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all";
  const ACTIVE = "px-3 py-1.5 text-sm font-medium rounded-xl text-gray-900";
  const DOTS = "px-2 py-1.5 text-sm text-gray-300";

  const pages: (number | "dots")[] = [];
  const add = (n: number) => {
    if (!pages.includes(n)) pages.push(n);
  };
  add(1);
  if (page > 3) pages.push("dots");
  for (
    let i = Math.max(2, page - 1);
    i <= Math.min(totalPages - 1, page + 1);
    i++
  )
    add(i);
  if (page < totalPages - 2) pages.push("dots");
  if (totalPages > 1) add(totalPages);

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Objecto
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Adjudicante
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Adjudicatário
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Celebração
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider w-[110px]">
                  <span className="inline-flex items-center gap-1">
                    CPV
                    <InfoPopover
                      text="Passe o rato por cima do código CPV para ver a descrição."
                      ariaLabel="Informação sobre coluna CPV"
                      placement="bottom"
                    />
                  </span>
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Valor
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contracts.map((c) => {
                const entityName =
                  Array.isArray(c.contracting_entities) &&
                  c.contracting_entities.length > 0
                    ? extractName(c.contracting_entities[0])
                    : "—";
                const winnerName =
                  Array.isArray(c.winners) && c.winners.length > 0
                    ? extractName(c.winners[0])
                    : "—";
                const statusBadge = resolveStatusBadge(c);
                const cpvTitle = c.cpv_main
                  ? cpvDescriptions[c.cpv_main] ||
                    "Descrição de CPV indisponível"
                  : undefined;

                return (
                  <tr
                    key={c.id}
                    className="hover:bg-green-50/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedId(c.id)}
                  >
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-green-600 font-medium line-clamp-2">
                        {c.object || "Sem objecto"}
                      </p>
                      {c.procedure_type && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {c.procedure_type}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] text-xs leading-normal">
                      {entityName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] text-xs leading-normal">
                      {winnerName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs tabular-nums">
                      {formatDate(c.signing_date)}
                    </td>
                    <td className="px-4 py-3 w-[110px]">
                      {c.cpv_main ? (
                        <span
                          title={cpvTitle}
                          className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono whitespace-nowrap"
                        >
                          {c.cpv_main}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="text-gray-900 font-medium text-xs">
                        {formatEur(c.contract_price)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge.className}`}
                        title={statusBadge.title}
                      >
                        {statusBadge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {contracts.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-16 text-center text-gray-400"
                  >
                    {hasFilters
                      ? "Nenhum contrato encontrado com estes filtros."
                      : "Nenhum contrato na base de dados. Execute a ingestão de contratos no Dashboard."}
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
            <Link href={buildQs(page - 1)} className={BTN}>
              ← Anterior
            </Link>
          )}
          {pages.map((p, i) =>
            p === "dots" ? (
              <span key={`dots-${i}`} className={DOTS}>
                ...
              </span>
            ) : (
              <Link
                key={p}
                href={buildQs(p)}
                className={p === page ? ACTIVE : BTN}
                style={
                  p === page ? { background: "rgba(74, 222, 128, 1)" } : {}
                }
              >
                {p}
              </Link>
            ),
          )}
          {page < totalPages && (
            <Link href={buildQs(page + 1)} className={BTN}>
              Próxima →
            </Link>
          )}
        </div>
      )}

      {selectedId && (
        <ContractModal
          contractId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
