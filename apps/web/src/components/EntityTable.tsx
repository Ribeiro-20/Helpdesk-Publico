"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type EntityRow = {
  id: string;
  nif: string;
  name: string;
  entity_type: string | null;
  location: string | null;
  total_contracts: number;
  total_value: number;
  avg_contract_value: number | null;
  last_activity_at: string | null;
  top_companies?: any[];
};

type ContractPreview = {
  id: string;
  object: string | null;
  contract_price: number | null;
  signing_date: string | null;
  cpv_main: string | null;
};

function formatEur(val: number | null): string {
  if (val == null) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(val);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("pt-PT");
}

export default function EntityTable({
  entities,
  selectedYear,
}: {
  entities: EntityRow[];
  selectedYear: number | null;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Close expanded row if year changes or entities list changes completely
  useEffect(() => {
    setExpandedId(null);
  }, [selectedYear, entities]);

  const toggleRow = (id: string) => {
    if (!selectedYear) return; // Only expandable if a year is selected
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                Entidade
              </th>
              {selectedYear && (
                <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider w-[120px]">
                  Contratos {selectedYear}
                </th>
              )}
              {selectedYear && (
                <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider w-[140px]">
                  Total {selectedYear}
                </th>
              )}
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider w-[140px]">
                Ação
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {entities.map((row) => {
              const isExpanded = expandedId === row.id;
              const contractsHref = selectedYear
                ? `/mercado-publico?entity=${encodeURIComponent(row.nif)}&from_date=${selectedYear}-01-01&to_date=${selectedYear}-12-31`
                : `/mercado-publico?entity=${encodeURIComponent(row.nif)}`;

              return (
                <>
                  <tr
                    key={row.id}
                    onClick={() => toggleRow(row.id)}
                    className={`transition-colors ${
                      selectedYear
                        ? "cursor-pointer hover:bg-gray-50"
                        : "hover:bg-green-50/40"
                    } ${isExpanded ? "bg-gray-50" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        {selectedYear && (
                          <div className="mt-1 text-gray-400">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        )}
                        <div>
                          <p className="text-green-700 font-medium leading-tight">
                            {row.name}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {row.nif}{" "}
                            {row.entity_type ? `· ${row.entity_type}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>

                    {selectedYear && (
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-xs font-medium">
                          {row.total_contracts}
                        </span>
                      </td>
                    )}

                    {selectedYear && (
                      <td className="px-4 py-3 text-center">
                        <span className="font-medium text-gray-900">
                          {formatEur(row.total_value)}
                        </span>
                      </td>
                    )}

                    <td className="px-4 py-3 text-right">
                      <Link
                        href={contractsHref}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-800 border border-green-200 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-all"
                      >
                        Ver contratos
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>

                  {/* Expanded Row Content */}
                  {isExpanded && selectedYear && (
                    <tr className="bg-gray-50/50">
                      <td colSpan={4} className="px-4 pb-4 pt-0">
                        <div className="pl-7">
                          <EntityContractsPreview
                            entityId={row.id}
                            year={selectedYear}
                            contractsHref={contractsHref}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}

            {entities.length === 0 && (
              <tr>
                <td
                  colSpan={selectedYear ? 4 : 2}
                  className="px-4 py-16 text-center text-gray-400"
                >
                  Nenhuma entidade encontrada com estes filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EntityContractsPreview({
  entityId,
  year,
  contractsHref,
}: {
  entityId: string;
  year: number;
  contractsHref: string;
}) {
  const [contracts, setContracts] = useState<ContractPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let active = true;

    async function fetchContracts() {
      setLoading(true);
      // Fetch up to 5 most recent contracts for this entity in this year
      // Note: We use 'active' status or similar if needed, but here simply by date/entity
      // Using 'contracts' table directly.
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;

      const { data, error } = await supabase
        .from("contracts")
        .select("id, object, contract_price, signing_date, cpv_main")
        .eq("entity_id", entityId)
        .gte("signing_date", start)
        .lte("signing_date", end)
        .order("signing_date", { ascending: false })
        .limit(5);

      if (active) {
        if (!error && data) {
          setContracts(data as ContractPreview[]);
        }
        setLoading(false);
      }
    }

    fetchContracts();

    return () => {
      active = false;
    };
  }, [entityId, year, supabase]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin text-green-500" />A carregar
        contratos de {year}...
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <div className="py-3 text-xs text-gray-400 italic">
        Não foi possível carregar pré-visualização dos contratos.
      </div>
    );
  }

  return (
    <div className="mt-2 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-3 h-3" />
          Últimos contratos de {year}
        </h4>
        <Link
          href={contractsHref}
          className="text-[10px] text-green-600 font-medium hover:underline"
        >
          Ver todos →
        </Link>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-white text-gray-400 border-b border-gray-100">
          <tr>
            <th className="px-5 py-3 text-left font-medium w-[110px]">Data</th>
            <th className="px-5 py-3 text-left font-medium">Objeto</th>
            <th className="px-5 py-3 text-right font-medium w-[120px]">
              Valor
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {contracts.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-5 py-3 text-gray-500 whitespace-nowrap align-top">
                {formatDate(c.signing_date)}
              </td>
              <td className="px-5 py-3 text-gray-700 align-top">
                <p
                  className="line-clamp-2 leading-relaxed max-w-[500px]"
                  title={c.object || ""}
                >
                  {c.object || "Sem objeto"}
                </p>
              </td>
              <td className="px-5 py-3 text-right font-medium text-gray-900 whitespace-nowrap align-top">
                {formatEur(c.contract_price)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
