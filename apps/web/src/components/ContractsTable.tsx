"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ContractModal from "./ContractModal";
import InfoPopover from "./InfoPopover";

export interface ContractRow {
  id: string;
  object: string | null;
  procedure_type: string | null;
  contract_type?: string | null;
  publication_date: string | null;
  signing_date: string | null;
  execution_deadline_days?: number | null;
  execution_locations?: string[];
  cpv_main: string | null;
  contract_price: number | null;
  base_price: number | null;
  status: string;
  contracting_entities: unknown[];
  winners: unknown[];
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

function closingDateIso(
  signingDate: string | null,
  deadlineDays: number | null | undefined,
): string | null {
  if (!signingDate || !deadlineDays || deadlineDays <= 0) return null;
  const date = new Date(`${signingDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + deadlineDays);
  return date.toISOString().slice(0, 10);
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
        label: "Terminado",
        className: "bg-red-100 text-red-700",
        title: `${progress.toFixed(0)}% do prazo de execucao`,
      };
    }

    return { label: "Ativo", className: "bg-green-100 text-green-700" };
  }

  return {
    label: contract.status || "Desconhecido",
    className: "bg-gray-100 text-gray-600",
  };
}

function decodeHtml(str: string): string {
  let s = str;
  for (let i = 0; i < 5; i++) {
    const next = s
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
    if (next === s) break;
    s = next;
  }
  return s;
}

function extractName(raw: unknown): string {
  if (typeof raw === "string") {
    const s = decodeHtml(raw);
    const idx = s.indexOf(" - ");
    return idx === -1 ? s : s.slice(idx + 3);
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const directName = record.name;
    if (typeof directName === "string" && directName.trim()) return decodeHtml(directName.trim());

    const value = record.value ?? record.label ?? record.text;
    if (typeof value === "string" && value.trim()) {
      const s = decodeHtml(value);
      const idx = s.indexOf(" - ");
      return idx === -1 ? s : s.slice(idx + 3);
    }
  }

  return "—";
}

export default function ContractsTable({
  contracts,
  queryError,
  dateField,
  totalPages,
  page,
  buildQsBase,
}: {
  contracts: ContractRow[];
  queryError: boolean;
  dateField: "publication_date" | "signing_date" | "closing_date";
  totalPages: number;
  page: number;
  buildQsBase: string;
}) {
  const pathname = usePathname();
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
    return `${pathname}?${url.searchParams.toString()}`;
  }

  const BTN =
    "px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all";
  const ACTIVE = "px-3 py-1.5 text-sm font-medium rounded-md text-white";
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
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Objecto
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Adjudicante(s)
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Adjudicatário
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                  Data
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider w-[110px]">
                  <span className="inline-flex items-center gap-1">
                    CPV
                    <InfoPopover
                      text="Passe o cursor sobre o código CPV para visualizar a descrição"
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
                const displayedDate =
                  dateField === "signing_date"
                    ? c.signing_date
                    : dateField === "closing_date"
                      ? closingDateIso(c.signing_date, c.execution_deadline_days)
                      : c.publication_date;
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
                      <p className="text-gray-900 font-medium line-clamp-2">
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
                      {formatDate(displayedDate)}
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
                    {queryError
                      ? "Não foi possível consultar os contratos neste momento. Tente novamente dentro de instantes."
                      : "Sem contratos a apresentar. Selecione ou ajuste os filtros para obter novos resultados."}
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
                style={p === page ? { background: "#3f6f27" } : {}}
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
