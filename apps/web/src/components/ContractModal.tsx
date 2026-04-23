"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, Loader2, Calendar, Tag } from "lucide-react";

interface Modification {
  id: string;
  modification_no: number;
  description: string | null;
  reason: string | null;
  previous_price: number | null;
  new_price: number | null;
  price_delta: number | null;
  modification_date: string | null;
}

interface Contract {
  id: string;
  object: string | null;
  description: string | null;
  procedure_type: string | null;
  contract_type: string | null;
  announcement_type: string | null;
  legal_regime: string | null;
  legal_basis: string | null;
  publication_date: string | null;
  award_date: string | null;
  signing_date: string | null;
  close_date: string | null;
  base_price: number | null;
  contract_price: number | null;
  effective_price: number | null;
  status: string;
  contracting_entities: unknown[];
  winners: unknown[];
  competitors: string | null;
  cpv_main: string | null;
  cpv_list: string[];
  execution_deadline_days: number | null;
  execution_locations: string[];
  is_centralized: boolean;
  is_ecological: boolean;
  end_type: string | null;
  procedure_docs_url: string | null;
  observations: string | null;
  framework_agreement: string | null;
  base_contract_id: string | null;
  base_procedure_id: string | null;
  base_announcement_no: string | null;
  base_incm_id: string | null;
}

function extractName(raw: unknown): string {
  if (typeof raw === "string") {
    const idx = raw.indexOf(" - ");
    return idx === -1 ? raw : raw.slice(idx + 3);
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const directName = record.name;
    if (typeof directName === "string" && directName.trim()) return directName;

    const value = record.value ?? record.label ?? record.text;
    if (typeof value === "string" && value.trim()) {
      const idx = value.indexOf(" - ");
      return idx === -1 ? value : value.slice(idx + 3);
    }
  }

  return "—";
}
function extractNif(raw: unknown): string {
  if (typeof raw === "string") {
    const idx = raw.indexOf(" - ");
    return idx === -1 ? "" : raw.slice(0, idx);
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const nif = record.nif;
    if (typeof nif === "string" && nif.trim()) return nif;

    const value = record.value ?? record.label ?? record.text;
    if (typeof value === "string") {
      const idx = value.indexOf(" - ");
      return idx === -1 ? "" : value.slice(0, idx);
    }
  }

  return "";
}

function parseCompetitors(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();

  // 1. Try standard JSON array ["a","b"]
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed))
        return parsed.map((s: string) => String(s).trim()).filter(Boolean);
    } catch {
      // fall through
    }

    // 2. Try single-quote array ['a','b'] — replace outer single quotes with double quotes
    try {
      const normalized = trimmed
        .replace(/^\[/, "[")
        .replace(/]$/, "]")
        // replace single-quoted strings: 'value' -> "value"
        // but only at item boundaries (preceded by [ or , and followed by , or ])
        .replace(/'([^']*)'/g, (_, inner) => `"${inner.replace(/"/g, '\\"')}"`);
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed))
        return parsed.map((s: string) => String(s).trim()).filter(Boolean);
    } catch {
      // fall through
    }

    // 3. Fallback: strip brackets and split by "," (quoted delimiter)
    const inner = trimmed.slice(1, -1); // remove [ and ]
    // Split on '",  "' or '", "' patterns — items separated by quote-comma-quote
    const byQuoteComma = inner.split(/['"]\s*,\s*['"]/);
    if (byQuoteComma.length > 1) {
      return byQuoteComma
        .map((s) => s.replace(/^['"]|['"]$/g, "").trim())
        .filter(Boolean);
    }
  }

  // 4. Plain comma-separated (no brackets) — but careful with "Empresa, S.A." patterns
  // Split only on commas followed by a space and an uppercase letter or digit (new entry heuristic)
  const entries: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    if (
      trimmed[i] === "," &&
      i + 1 < trimmed.length &&
      /\s/.test(trimmed[i + 1]) &&
      i + 2 < trimmed.length &&
      /[A-Z0-9]/.test(trimmed[i + 2])
    ) {
      // Check it's not a known suffix like "Lda.", "S.A.", "Unip.", etc.
      const next = trimmed.slice(i + 1).trimStart();
      const isSuffix =
        /^(S\.A\.|Lda\.|Unip\.|Lda|SA|Unipessoal|e\.V\.|Inc\.|Ltd\.)/i.test(
          next,
        );
      if (!isSuffix) {
        entries.push(current.trim());
        current = "";
        i++; // skip the space
        continue;
      }
    }
    current += trimmed[i];
  }
  if (current.trim()) entries.push(current.trim());
  return entries.filter(Boolean);
}

function fmtEur(val: number | null): string {
  if (val == null) return "—";
  return (
    Number(val).toLocaleString("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

const HEADER_BG = "rgba(26, 27, 31, 1)";
const GREEN = "rgba(74, 222, 128, 1)";

export default function ContractModal({
  contractId,
  onClose,
}: {
  contractId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    contract: Contract;
    modifications: Modification[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/contracts/${contractId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [contractId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const contract = data?.contract;
  const modifications = data?.modifications ?? [];
  const entities = Array.isArray(contract?.contracting_entities)
    ? contract!.contracting_entities
    : [];
  const winners = Array.isArray(contract?.winners) ? contract!.winners : [];
  const locations = Array.isArray(contract?.execution_locations)
    ? contract!.execution_locations
    : [];
  const cpvList = Array.isArray(contract?.cpv_list) ? contract!.cpv_list : [];
  const competitors = contract?.competitors
    ? parseCompetitors(contract.competitors)
    : [];

  const portalUrl = contract?.base_contract_id
    ? `https://www.base.gov.pt/Base4/pt/detalhe/?type=contratos&id=${contract.base_contract_id}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl h-full md:h-auto md:max-h-[92vh] flex flex-col md:rounded-2xl overflow-hidden shadow-2xl bg-white">
        {/* ── HEADER ── */}
        <div
          className="shrink-0 px-6 pt-6 pb-6 pr-16"
          style={{ background: HEADER_BG }}
        >
          {contract?.base_contract_id && (
            <p
              className="text-xs font-semibold mb-1.5"
              style={{ color: GREEN }}
            >
              Contrato #{contract.base_contract_id}
            </p>
          )}
          {loading ? (
            <div className="h-6 w-3/4 bg-white/10 rounded animate-pulse" />
          ) : (
            <h2 className="text-white text-lg font-bold leading-snug">
              {contract?.object || "Contrato sem objecto"}
            </h2>
          )}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto bg-white px-6 py-5 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
              Erro ao carregar o contrato.
            </div>
          )}

          {!loading && !error && contract && (
            <>
              {/* ── CLASSIFICAÇÃO ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4" style={{ color: GREEN }} />
                  <h3
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: GREEN }}
                  >
                    Classificação
                  </h3>
                </div>
                <hr className="border-gray-200 mb-4" />
                <div className="flex flex-col gap-5">
                  {contract.contract_type && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                        Tipo de Contrato
                      </p>
                      <div className="flex flex-wrap">
                        <span className="text-sm px-3 py-1 rounded-full border border-purple-200 bg-purple-50 text-purple-700 leading-normal">
                          {contract.contract_type}
                        </span>
                      </div>
                    </div>
                  )}
                  {contract.procedure_type && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                        Tipo de Procedimento
                      </p>
                      <div className="flex flex-wrap">
                        <span className="text-sm px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 leading-normal">
                          {contract.procedure_type}
                        </span>
                      </div>
                    </div>
                  )}
                  {contract.announcement_type && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                        Tipo de Anúncio
                      </p>
                      <div className="flex flex-wrap">
                        <span className="text-sm px-3 py-1 rounded-full border border-teal-200 bg-teal-50 text-teal-700 leading-normal">
                          {contract.announcement_type}
                        </span>
                      </div>
                    </div>
                  )}
                  {contract.legal_regime && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                        Regime Jurídico
                      </p>
                      <div className="flex flex-wrap">
                        <span className="text-sm px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700 leading-normal">
                          {contract.legal_regime}
                        </span>
                      </div>
                    </div>
                  )}
                  {contract.legal_basis && (
                    <div className="col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                        Fundamento Legal
                      </p>
                      <p className="text-sm text-gray-700">
                        {contract.legal_basis}
                      </p>
                    </div>
                  )}
                  {cpvList.length > 0 && (
                    <div className="col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                        Códigos CPV
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {cpvList.map((c, i) => (
                          <span
                            key={i}
                            className="inline-block text-sm px-3 py-1 rounded-full border border-orange-200 bg-orange-50 text-orange-700"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {contract.framework_agreement && (
                    <div className="col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                        Acordo Quadro
                      </p>
                      <p className="text-sm text-gray-700">
                        {contract.framework_agreement?.toUpperCase() === "NULL"
                          ? "Não aplicável"
                          : contract.framework_agreement}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── PRICES ── */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Preço Base
                  </p>
                  <p
                    className="text-lg md:text-xl font-bold"
                    style={{ color: GREEN }}
                  >
                    {fmtEur(contract.base_price)}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Preço Contratual
                  </p>
                  <p
                    className="text-lg md:text-xl font-bold"
                    style={{ color: GREEN }}
                  >
                    {fmtEur(contract.contract_price)}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Preço Total Efectivo
                  </p>
                  <p
                    className="text-lg md:text-xl font-bold"
                    style={{ color: GREEN }}
                  >
                    {fmtEur(contract.effective_price)}
                  </p>
                </div>
              </div>

              {/* ── FLAGS ── */}
              {(contract.is_ecological ||
                contract.is_centralized ||
                contract.end_type) && (
                <div className="flex flex-wrap gap-2">
                  {contract.is_ecological && (
                    <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 font-medium">
                      🌿 Contrato Ecológico
                    </span>
                  )}
                  {contract.is_centralized && (
                    <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-medium">
                      🏛 Centralizado
                    </span>
                  )}
                  {contract.end_type && (
                    <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-700 font-medium">
                      Fim: {contract.end_type}
                    </span>
                  )}
                </div>
              )}

              {/* ── DATAS ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4" style={{ color: GREEN }} />
                  <h3
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: GREEN }}
                  >
                    Datas
                  </h3>
                </div>
                <hr className="border-gray-200 mb-4" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {contract.publication_date && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                        Publicação
                      </p>
                      <p className="text-sm text-gray-800">
                        {fmtDate(contract.publication_date)}
                      </p>
                    </div>
                  )}
                  {contract.signing_date && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                        Celebração
                      </p>
                      <p className="text-sm text-gray-800">
                        {fmtDate(contract.signing_date)}
                      </p>
                    </div>
                  )}
                  {contract.award_date && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                        Decisão de Adjudicação
                      </p>
                      <p className="text-sm text-gray-800">
                        {fmtDate(contract.award_date)}
                      </p>
                    </div>
                  )}
                  {contract.close_date && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                        Fecho
                      </p>
                      <p className="text-sm text-gray-800">
                        {fmtDate(contract.close_date)}
                      </p>
                    </div>
                  )}
                  {contract.execution_deadline_days && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                        Prazo de Execução
                      </p>
                      <p className="text-sm text-gray-800">
                        {contract.execution_deadline_days} dias
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── REFERÊNCIAS BASE ── */}
              {(contract.base_contract_id ||
                contract.base_procedure_id ||
                contract.base_announcement_no ||
                contract.base_incm_id) && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3
                      className="text-xs font-bold uppercase tracking-widest"
                      style={{ color: GREEN }}
                    >
                      Referências BASE
                    </h3>
                  </div>
                  <hr className="border-gray-200 mb-4" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {contract.base_contract_id && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                          ID Contrato
                        </p>
                        <p className="text-sm font-mono text-gray-800">
                          {contract.base_contract_id}
                        </p>
                      </div>
                    )}
                    {contract.base_procedure_id && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                          ID Procedimento
                        </p>
                        <p className="text-sm font-mono text-gray-800">
                          {contract.base_procedure_id}
                        </p>
                      </div>
                    )}
                    {contract.base_announcement_no && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                          Nº Anúncio
                        </p>
                        <p className="text-sm font-mono text-gray-800">
                          {contract.base_announcement_no}
                        </p>
                      </div>
                    )}
                    {contract.base_incm_id && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                          ID INCM
                        </p>
                        <p className="text-sm font-mono text-gray-800">
                          {contract.base_incm_id}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── ENTIDADES ── */}
              {(entities.length > 0 || winners.length > 0) && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-4 h-4 flex items-center justify-center">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-4 h-4"
                        style={{ color: GREEN }}
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </span>
                    <h3
                      className="text-xs font-bold uppercase tracking-widest"
                      style={{ color: GREEN }}
                    >
                      Entidades
                    </h3>
                  </div>
                  <hr className="border-gray-200 mb-4" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {entities.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                          Entidade Adjudicante
                        </p>
                        {entities.map((raw, i) => (
                          <div key={i} className="mb-1">
                            <p className="text-sm font-medium text-gray-900">
                              {extractName(raw)}
                            </p>
                            {extractNif(raw) && (
                              <p className="text-xs text-gray-400 font-mono">
                                {extractNif(raw)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {winners.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                          ENTIDADE(S) VENCEDORA(S)
                        </p>
                        {winners.map((raw, i) => (
                          <div key={i} className="mb-1">
                            <p className="text-sm font-medium text-gray-900">
                              {extractName(raw)}
                            </p>
                            {extractNif(raw) && (
                              <p className="text-xs text-gray-400 font-mono">
                                {extractNif(raw)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── LOCAIS ── */}
              {locations.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Locais de Execução
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {locations.map((loc, i) => (
                      <span
                        key={i}
                        className="text-xs bg-gray-100 text-gray-700 rounded-lg px-2.5 py-1"
                      >
                        {loc}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── CONCORRENTES ── */}
              {competitors.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                    Concorrentes ({competitors.length})
                  </p>
                  <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                    {competitors.map((entry, i) => {
                      const nif = extractNif(entry);
                      const name = extractName(entry);
                      return (
                        <li
                          key={i}
                          className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-gray-50"
                        >
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold shrink-0">
                            {i + 1}
                          </span>
                          <div>
                            <p className="text-sm text-gray-900">{name}</p>
                            {nif && nif !== name && (
                              <p className="text-xs text-gray-400 font-mono">
                                {nif}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* ── MODIFICAÇÕES ── */}
              {modifications.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                    Modificações contratuais ({modifications.length})
                  </p>
                  <div className="space-y-2">
                    {modifications.map((mod) => (
                      <div
                        key={mod.id}
                        className="border border-gray-200 rounded-xl p-3"
                      >
                        <div className="flex items-center gap-3 mb-1">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold shrink-0">
                            {mod.modification_no}
                          </span>
                          {mod.modification_date && (
                            <span className="text-xs text-gray-400">
                              {mod.modification_date}
                            </span>
                          )}
                          {mod.price_delta != null && (
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${mod.price_delta > 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}
                            >
                              {mod.price_delta > 0 ? "+" : ""}
                              {Number(mod.price_delta).toLocaleString("pt-PT", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              €
                            </span>
                          )}
                        </div>
                        {mod.description && (
                          <p className="text-sm text-gray-700">
                            {mod.description}
                          </p>
                        )}
                        {mod.previous_price != null &&
                          mod.new_price != null && (
                            <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
                              <span>
                                {Number(mod.previous_price).toLocaleString(
                                  "pt-PT",
                                  { minimumFractionDigits: 2 },
                                )}{" "}
                                €
                              </span>
                              <span className="text-gray-300">→</span>
                              <span className="font-medium text-gray-700">
                                {Number(mod.new_price).toLocaleString("pt-PT", {
                                  minimumFractionDigits: 2,
                                })}{" "}
                                €
                              </span>
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── OBSERVAÇÕES ── */}
              {contract.observations && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Observações
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {contract.observations}
                  </p>
                </div>
              )}

              {/* ── DESCRIÇÃO ── */}
              {contract.description && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                    Descrição
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {contract.description}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="shrink-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {portalUrl && (
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Ver no Portal BASE
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-sm font-medium px-5 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
