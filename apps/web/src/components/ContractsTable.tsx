"use client";

import { useState } from "react";
import Link from "next/link";
import ContractModal from "./ContractModal";

interface ContractRow {
  id: string;
  object: string | null;
  procedure_type: string | null;
  signing_date: string | null;
  cpv_main: string | null;
  contract_price: number | null;
  base_price: number | null;
  status: string;
  contracting_entities: string[];
  winners: string[];
}

function formatEur(val: number | null): string {
  if (val == null) return "—";
  if (val >= 1_000_000)
    return `${(val / 1_000_000).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M €`;
  if (val >= 1_000)
    return `${(val / 1_000).toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k €`;
  return (
    val.toLocaleString("pt-PT", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " €"
  );
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function discountBadge(base: number | null, contract: number | null) {
  if (base == null || contract == null || base === 0) return null;
  const pct = ((base - contract) / base) * 100;
  if (Math.abs(pct) < 0.5) return null;
  const isDiscount = pct > 0;
  return (
    <span
      className={`inline-block text-xs px-1.5 py-0.5 rounded font-medium ${
        isDiscount ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
      }`}
    >
      {isDiscount ? "-" : "+"}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
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
  buildQsBase: string; // base URL with current filters, without page
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Objecto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Entidade</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Vencedor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Celebração</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">CPV</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Valor</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Estado</th>
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
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate text-xs">{entityName}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate text-xs">{winnerName}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs tabular-nums">
                      {formatDate(c.signing_date)}
                    </td>
                    <td className="px-4 py-3">
                      {c.cpv_main ? (
                        <span className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono whitespace-nowrap">
                          {c.cpv_main}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="text-gray-900 font-medium text-xs">{formatEur(c.contract_price)}</span>
                      {discountBadge(c.base_price, c.contract_price) && (
                        <span className="ml-1.5">
                          {discountBadge(c.base_price, c.contract_price)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.status === "active"
                            ? "bg-green-100 text-green-700"
                            : c.status === "closed"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {c.status === "active"
                          ? "Activo"
                          : c.status === "closed"
                            ? "Fechado"
                            : c.status === "modified"
                              ? "Modificado"
                              : c.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {contracts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
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

      {/* Pagination */}
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

      {/* Modal */}
      {selectedId && (
        <ContractModal
          contractId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
