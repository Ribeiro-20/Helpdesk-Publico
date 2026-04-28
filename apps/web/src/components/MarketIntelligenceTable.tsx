"use client";

import { useState, useEffect, useMemo } from "react";
import ContractModal from "./ContractModal";
import { createClient } from "@/lib/supabase/client";
import InfoPopover from "./InfoPopover";

interface Contract {
  id: string;
  object: string | null;
  cpv_main: string | null;
  signing_date: string | null;
  execution_deadline_days: number | null;
  contracting_entities: any[];
  winners: any[];
  contract_price: number | null;
  progress: number;
  is_overdue: boolean;
}

export default function MarketIntelligenceTable({ contracts }: { contracts: Contract[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [cpvDescriptions, setCpvDescriptions] = useState<Record<string, string>>({});
  const supabase = createClient();

  // Get unique CPV codes on the current page to fetch descriptions
  const cpvCodesOnPage = useMemo(
    () => Array.from(new Set(contracts.map((c) => c.cpv_main).filter(Boolean) as string[])),
    [contracts]
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

  if (contracts.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-gray-200 shadow-sm">
        <p className="text-gray-500 font-medium">Não foram encontrados contratos com este critério.</p>
        <p className="text-gray-400 text-sm mt-1">Nenhum contrato atingiu o limite de 75% de execução.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(contracts.length / itemsPerPage);
  const currentItems = contracts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full">
        <div className="overflow-x-auto w-full">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    Informação do Contrato
                    <InfoPopover text="Clique sobre o contrato pretendido para aceder a toda a informação disponível." placement="bottom" align="start" />
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    CPV
                    <InfoPopover text="Passe o rato por cima do código CPV para ver a descrição." placement="bottom" />
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    Entidades
                    <InfoPopover text="Entidades relacionadas no contrato." placement="bottom" />
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">
                  <div className="flex items-center justify-center gap-2">
                    Progresso
                    <InfoPopover text="Progresso estimado do contrato." placement="bottom" />
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">
                  <div className="flex items-center justify-end gap-2">
                    Valor
                    <InfoPopover text="Valor pelo qual o contrato foi celebrado." placement="bottom" align="end" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {currentItems.map((c) => {
                let barColor = "bg-green-400";
                let textColor = "text-gray-700";
                let progressLabel = `${(c.progress * 100).toFixed(0)}%`;

                if (c.progress >= 1.0) {
                  barColor = "bg-rose-500";
                  textColor = "text-rose-600 font-bold";
                  progressLabel = "Terminado";
                } else if (c.progress >= 0.9) {
                  barColor = "bg-yellow-400";
                  textColor = "text-amber-600 font-bold";
                  progressLabel = `${(c.progress * 100).toFixed(0)}%`;
                } else {
                  barColor = "bg-green-400";
                  textColor = "text-green-700 font-bold";
                  progressLabel = `${(c.progress * 100).toFixed(0)}%`;
                }

                return (
                  <tr
                    key={c.id}
                    className="hover:bg-green-50/50 transition-colors cursor-pointer group"
                    onClick={() => setSelectedId(c.id)}
                  >
                    <td className="px-6 py-5">
                      <p className="text-[12px] font-semibold text-gray-900 group-hover:text-green-600 transition-colors line-clamp-2">
                        {c.object || "Sem objecto"}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 font-mono">
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                          Data celebração: {c.signing_date}
                        </span>
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                          Prazo execução: {c.execution_deadline_days} dias
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {c.cpv_main ? (
                        <span
                          title={cpvDescriptions[c.cpv_main] || "A carregar descrição..."}
                          className="inline-block bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded font-mono whitespace-nowrap"
                        >
                          {c.cpv_main}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-xs text-gray-500 font-medium truncate max-w-[200px]">
                        {c.contracting_entities?.[0] || "N/A"}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5 italic truncate max-w-[200px]">
                        {c.winners?.[0] || "N/A"}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${Math.min(c.progress * 100, 100)}%` }}
                          />
                        </div>
                        <span className={`text-[11px] ${textColor}`}>
                          {progressLabel}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <p className="text-[12px] font-bold text-gray-900">
                        {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(c.contract_price || 0)}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <div className="text-xs text-gray-500 font-medium">
            A mostrar {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, contracts.length)} de {contracts.length} resultados
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-all"
            >
              Anterior
            </button>
            {pages.map((p, idx) => (
              <button
                key={idx}
                onClick={() => typeof p === "number" && setCurrentPage(p)}
                disabled={p === "..."}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${p === currentPage
                  ? "bg-green-500 text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                  } ${p === "..." ? "cursor-default" : ""}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-all"
            >
              Seguinte
            </button>
          </div>
        </div>
      </div>

      {selectedId && (
        <ContractModal
          contractId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
