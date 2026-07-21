"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import ContractModal from "./ContractModal";
import { createClient } from "@/lib/supabase/client";
import InfoPopover from "./InfoPopover";

/** Extract NIF and name from strings like "501413197 - Nome da Empresa" or "- - Nome" or "- Nome" */
function parseEntityString(raw: unknown): { nif: string; name: string } {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    // Match a 9-digit NIF at the beginning followed by a hyphen
    const match = trimmed.match(/^(\d{9})\s*-\s*(.+)$/);
    if (match) {
      return {
        nif: match[1],
        name: match[2].replace(/^[\s\-\/\.]+/g, "").trim() || "—",
      };
    }
    // Otherwise, it's just a name, clean up any leading hyphens, spaces, or dots
    const cleanedName = trimmed.replace(/^[\s\-\/\.]+/g, "").trim();
    return { nif: "", name: cleanedName || "—" };
  }
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const value = (record.value ?? record.label ?? record.text ?? record.name) as string | undefined;
    if (typeof value === "string" && value.trim()) {
      return parseEntityString(value);
    }
  }
  return { nif: "", name: "—" };
}

interface Contract {
  id: string;
  object: string | null;
  cpv_main: string | null;
  cpv_description?: string | null;
  signing_date: string | null;
  execution_deadline_days: number | null;
  contracting_entities: any[];
  winners: any[];
  contract_price: number | null;
  progress: number;
  is_overdue: boolean;
}

export default function MarketIntelligenceTable({ 
  contracts,
  itemsPerPage = 20
}: { 
  contracts: Contract[];
  itemsPerPage?: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [cpvDescriptions, setCpvDescriptions] = useState<Record<string, string>>({});
  // Use a ref to track which codes have already been fetched to avoid infinite re-render loops
  const fetchedCodesRef = useRef<Set<string>>(new Set());
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  // Auto-open modal if ?contract=<id> is present in the URL (e.g. from email link)
  useEffect(() => {
    const contractParam = searchParams.get("contract");
    if (contractParam) {
      setSelectedId(contractParam);
    }
  }, [searchParams]);

  // Reset to page 1 whenever the contract list or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [contracts, itemsPerPage]);

  // Get unique CPV codes on the current page to fetch descriptions
  const cpvCodesOnPage = useMemo(
    () => Array.from(new Set(contracts.map((c) => c.cpv_main).filter(Boolean) as string[])),
    [contracts]
  );

  useEffect(() => {
    if (cpvCodesOnPage.length === 0) return;

    // Only fetch codes we haven't fetched yet (avoids infinite loops)
    const missing = cpvCodesOnPage.filter((code) => !fetchedCodesRef.current.has(code));
    if (missing.length === 0) return;

    // Mark as fetched immediately to prevent concurrent duplicate requests
    missing.forEach((code) => fetchedCodesRef.current.add(code));

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
  }, [cpvCodesOnPage, supabase]);

  // Filter out contracts that have reached > 100%
  const visibleContracts = useMemo(
    () => contracts.filter((c) => c.progress <= 1.00),
    [contracts]
  );

  if (visibleContracts.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-gray-200 shadow-sm">
        <p className="text-gray-500 font-medium">Não foram encontrados contratos com este critério.</p>
        <p className="text-gray-400 text-sm mt-1">Nenhum contrato atingiu o limite de 75% de execução.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(visibleContracts.length / itemsPerPage);
  const currentItems = visibleContracts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full min-w-[850px] table-fixed text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="bg-gray-50">
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider w-[35%] min-w-[280px]">
                  <div className="flex items-center gap-2">
                    Informação do Contrato
                    <InfoPopover text="Clique sobre o contrato pretendido para aceder a toda a informação disponível." placement="bottom-start" />
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider w-[16%] min-w-[130px]">
                  <div className="flex items-center gap-2">
                    CPV
                    <InfoPopover text="Passe o rato por cima do código CPV para ver a descrição." placement="bottom" />
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider w-[25%] min-w-[220px]">
                  <div className="flex items-center gap-2">
                    Entidades
                    <InfoPopover text="Entidades relacionadas no contrato." placement="bottom" />
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center w-[12%] min-w-[110px]">
                  <div className="flex items-center justify-center gap-2">
                    Progresso
                    <InfoPopover text="Progresso estimado do contrato." placement="bottom" />
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right w-[12%] min-w-[110px]">
                  <div className="flex items-center justify-end gap-2">
                    Valor
                    <InfoPopover text="Valor pelo qual o contrato foi celebrado." placement="bottom-end" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {currentItems.map((c) => {
                let barColor = "bg-green-400";
                let textColor = "text-green-700 font-bold";
                const progressPct = (c.progress * 100).toFixed(0);
                const progressLabel = `${progressPct}%`;

                if (c.progress >= 1.0) {
                  // 100% or over — red: contract has expired
                  barColor = "bg-red-500";
                  textColor = "text-red-600 font-bold";
                } else if (c.progress >= 0.9) {
                  // 90%-99% — amber: contract nearing end
                  barColor = "bg-amber-400";
                  textColor = "text-amber-600 font-bold";
                } else {
                  // 75%-89% — green: contract in progress
                  barColor = "bg-green-400";
                  textColor = "text-green-700 font-bold";
                }

                const resolvedCpvDesc = c.cpv_description || (c.cpv_main ? cpvDescriptions[c.cpv_main] : null);

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
                        <div className="relative group/cpv inline-block">
                          <span
                            title={resolvedCpvDesc || "Descrição de CPV indisponível"}
                            className="inline-block bg-blue-50 text-blue-700 text-[11px] px-2 py-0.5 rounded font-mono whitespace-nowrap border border-blue-100/80 font-semibold cursor-help transition-all hover:bg-blue-100 hover:text-blue-800"
                          >
                            {c.cpv_main}
                          </span>
                          <div className="pointer-events-none absolute left-0 bottom-[calc(100%+6px)] z-50 hidden group-hover/cpv:block w-72 rounded-xl border border-gray-200 bg-gray-900 text-white p-3 shadow-xl font-sans normal-case whitespace-normal">
                            <p className="text-[10px] font-bold uppercase text-blue-300 tracking-wider mb-1">
                              CPV {c.cpv_main}
                            </p>
                            <p className="text-xs leading-relaxed text-gray-100 font-medium">
                              {resolvedCpvDesc || "Descrição de CPV indisponível"}
                            </p>
                            <span className="absolute -bottom-1 left-4 h-2 w-2 rotate-45 bg-gray-900" />
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      {(() => {
                        const entity = parseEntityString(c.contracting_entities?.[0]);
                        const winner = parseEntityString(c.winners?.[0]);
                        return (
                          <>
                            <p className="text-xs text-gray-700 font-semibold truncate max-w-[250px]" title={entity.nif ? `${entity.nif} - ${entity.name}` : entity.name}>
                              {entity.nif ? (
                                <>
                                  <span className="text-green-600 font-bold">{entity.nif}</span>
                                  <span className="text-gray-500"> - {entity.name}</span>
                                </>
                              ) : (
                                <span className="text-gray-500">{entity.name}</span>
                              )}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-1 italic truncate max-w-[250px]" title={winner.nif ? `${winner.nif} - ${winner.name}` : winner.name}>
                              {winner.nif ? (
                                <>
                                  <span className="not-italic font-semibold text-gray-500">{winner.nif}</span>
                                  <span> - {winner.name}</span>
                                </>
                              ) : (
                                <span>{winner.name}</span>
                              )}
                            </p>
                          </>
                        );
                      })()}
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
            A mostrar {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, visibleContracts.length)} de {visibleContracts.length} resultados
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
