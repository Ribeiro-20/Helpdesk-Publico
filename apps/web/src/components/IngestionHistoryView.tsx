"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SingleDatePicker from "@/components/SingleDatePicker";

type HistoryCategory = "announcements" | "contracts" | "extraction" | "processing" | "other";
type HistoryFilter = HistoryCategory | "all";

type HistoryStep = {
  fn: string;
  label: string;
  category: HistoryCategory;
  status: "success" | "error";
  summary: string[];
  payload: unknown;
};

type HistoryEntry = {
  id: string;
  at: string;
  userId: string;
  title: string;
  status: "success" | "error";
  category: HistoryCategory;
  range: { fromDate?: string; toDate?: string } | null;
  steps: HistoryStep[];
  note?: string;
};

type HistoryRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  status: "success" | "error";
  category: HistoryCategory;
  range: unknown;
  steps: unknown;
  note: string | null;
  created_at: string;
};

const LEGACY_HISTORY_STORAGE_PREFIX = "estagio-base-monitor:ingestion-history";
const HISTORY_TABLE = "ingestion_history";
const HISTORY_FILTERS: Array<{ key: HistoryFilter; label: string }> = [
  { key: "all", label: "Tudo" },
  { key: "announcements", label: "Anúncios" },
  { key: "contracts", label: "Contratos" },
  { key: "extraction", label: "Entidades e empresas" },
  { key: "processing", label: "Processamento" },
];
const MIN_INGEST_DATE = "2026-01-01";

function getLegacyHistoryStorageKey(userId: string) {
  return `${LEGACY_HISTORY_STORAGE_PREFIX}:${userId}`;
}

function readLegacyHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is HistoryEntry => Boolean(entry && typeof entry === "object" && typeof entry.id === "string"));
  } catch {
    return [];
  }
}

function formatHistoryTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("pt-PT");
}

function historyEntryDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeHistoryText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function historyCategoryLabel(category: HistoryCategory) {
  switch (category) {
    case "announcements":
      return "Anúncios";
    case "contracts":
      return "Contratos";
    case "extraction":
      return "Entidades e empresas";
    case "processing":
      return "Processamento";
    default:
      return "Outros";
  }
}

function historyStepBadgeClass(status: "success" | "error") {
  return status === "success"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-red-50 text-red-700 border-red-200";
}

function actionCategory(fn: string): HistoryCategory {
  if (fn === "ingest-base" || fn === "ingest-dr" || fn === "delete-announcements") {
    return "announcements";
  }

  if (fn === "ingest-contracts") {
    return "contracts";
  }

  if (fn === "extract-entities" || fn === "extract-companies") {
    return "extraction";
  }

  if (fn === "match-and-queue" || fn === "send-emails" || fn === "admin-seed") {
    return "processing";
  }

  return "other";
}

function parseRange(value: unknown): { fromDate?: string; toDate?: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const fromDate = typeof record.fromDate === "string" ? record.fromDate : undefined;
  const toDate = typeof record.toDate === "string" ? record.toDate : undefined;
  if (!fromDate && !toDate) return null;
  return { fromDate, toDate };
}

function parseStep(step: unknown): HistoryStep | null {
  if (!step || typeof step !== "object") return null;
  const record = step as Record<string, unknown>;

  const fn = typeof record.fn === "string" ? record.fn : "unknown";
  const label = typeof record.label === "string" ? record.label : fn;
  const category =
    record.category === "announcements" ||
    record.category === "contracts" ||
    record.category === "extraction" ||
    record.category === "processing" ||
    record.category === "other"
      ? record.category
      : actionCategory(fn);
  const status = record.status === "error" ? "error" : "success";
  const summary = Array.isArray(record.summary) ? record.summary.filter((item): item is string => typeof item === "string") : [];
  const payload = record.payload ?? null;

  return { fn, label, category, status, summary, payload };
}

function normalizeHistoryEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    at: row.created_at,
    userId: row.user_id,
    title: row.title,
    status: row.status,
    category: row.category,
    range: parseRange(row.range),
    steps: Array.isArray(row.steps) ? row.steps.map(parseStep).filter((step): step is HistoryStep => step !== null) : [],
    note: row.note ?? undefined,
  };
}

function buildHistoryRow(entry: HistoryEntry, tenantId: string, userId: string) {
  return {
    tenant_id: tenantId,
    user_id: userId,
    title: entry.title,
    status: entry.status,
    category: entry.category,
    range: entry.range ?? {},
    steps: entry.steps,
    note: entry.note ?? null,
  };
}

function compactValue(value: unknown, depth = 2): unknown {
  if (depth <= 0) {
    if (Array.isArray(value)) return `[Array(${value.length})]`;
    if (value && typeof value === "object") return "[Object]";
    return value;
  }

  if (Array.isArray(value)) {
    const slice = value.slice(0, 10).map((item) => compactValue(item, depth - 1));
    if (value.length > 10) slice.push(`… +${value.length - 10} itens`);
    return slice;
  }

  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.length > 300) {
      return `${value.slice(0, 300)}…`;
    }
    return value;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.entries(record)
    .slice(0, 18)
    .map(([key, entryValue]) => [key, compactValue(entryValue, depth - 1)] as const);
  return Object.fromEntries(entries);
}

function summaryForEntry(entry: HistoryEntry) {
  return normalizeHistoryText(
    [
      entry.title,
      entry.category,
      entry.status,
      entry.note ?? "",
      entry.at,
      ...(entry.range?.fromDate ? [entry.range.fromDate] : []),
      ...(entry.range?.toDate ? [entry.range.toDate] : []),
      ...entry.steps.flatMap((step) => [step.fn, step.label, step.category, step.status, ...step.summary]),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export default function IngestionHistoryView() {
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        setHistoryEntries([]);
        setHistoryLoading(false);
        return;
      }

      const [appUserResult, historyResult] = await Promise.all([
        supabase.from("app_users").select("tenant_id").eq("id", user.id).maybeSingle(),
        supabase
          .from(HISTORY_TABLE)
          .select("id, tenant_id, user_id, title, status, category, range, steps, note, created_at")
          .order("created_at", { ascending: false })
          .limit(60),
      ]);

      if (!active) return;

      if (appUserResult.error) {
        setHistoryError(appUserResult.error.message);
      }

      if (historyResult.error) {
        setHistoryError(historyResult.error.message);
        setHistoryEntries([]);
        setHistoryLoading(false);
        return;
      }

      let entries = (historyResult.data ?? []).map((row) => normalizeHistoryEntry(row as HistoryRow));

      if (
        entries.length === 0 &&
        typeof window !== "undefined" &&
        appUserResult.data?.tenant_id
      ) {
        const legacyEntries = readLegacyHistory(window.localStorage.getItem(getLegacyHistoryStorageKey(user.id)));

        if (legacyEntries.length > 0) {
          const { error: importError } = await supabase.from(HISTORY_TABLE).insert(
            legacyEntries.map((entry) => buildHistoryRow(entry, appUserResult.data!.tenant_id, user.id)),
          );

          if (!active) return;

          if (importError) {
            setHistoryError(importError.message);
          } else {
            window.localStorage.removeItem(getLegacyHistoryStorageKey(user.id));
            const { data: importedRows, error: reloadError } = await supabase
              .from(HISTORY_TABLE)
              .select("id, tenant_id, user_id, title, status, category, range, steps, note, created_at")
              .order("created_at", { ascending: false })
              .limit(60);

            if (!active) return;

            if (reloadError) {
              setHistoryError(reloadError.message);
            } else {
              entries = (importedRows ?? []).map((row) => normalizeHistoryEntry(row as HistoryRow));
            }
          }
        }
      }

      setHistoryEntries(entries);
      setHistoryLoading(false);
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [supabase]);

  const filteredEntries = useMemo(
    () =>
      historyEntries.filter((entry) => {
        const entryDate = historyEntryDate(entry.at);
        if (historyFromDate && (!entryDate || entryDate < historyFromDate)) return false;
        if (historyToDate && (!entryDate || entryDate > historyToDate)) return false;

        const categoryMatches =
          historyFilter === "all" ||
          entry.category === historyFilter ||
          entry.steps.some((step) => step.category === historyFilter);

        if (!categoryMatches) return false;

        const term = normalizeHistoryText(historySearch.trim());
        if (!term) return true;

        return summaryForEntry(entry).includes(term);
      }),
    [historyEntries, historyFilter, historyFromDate, historySearch, historyToDate],
  );

  function clearFilters() {
    setHistoryFilter("all");
    setHistoryFromDate("");
    setHistoryToDate("");
    setHistorySearch("");
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Histórico de ingestão</h2>
          <p className="text-gray-400 text-sm mt-1">Registos guardados no Supabase para este utilizador.</p>
        </div>

        {historyError && (
          <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
            {historyError}
          </div>
        )}

        <div className="space-y-4 border-t border-surface-100 pt-5">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-1.5">Pesquisa</label>
            <input
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              placeholder='Pesquisar por “anúncios”, “contratos” ou nome da ação'
              className="w-full rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {HISTORY_FILTERS.map((filter) => {
                const active = historyFilter === filter.key;
                return (
                  <button
                    key={filter.key}
                    onClick={() => setHistoryFilter(filter.key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${active ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-surface-200 hover:bg-surface-50"}`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>

            <button onClick={clearFilters} className="text-xs font-medium text-gray-500 hover:text-gray-900">
              Limpar filtros
            </button>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px]">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Desde</p>
                <SingleDatePicker value={historyFromDate} onChange={setHistoryFromDate} placeholder="Data inicial" min={MIN_INGEST_DATE} />
              </div>
              <div className="min-w-[180px]">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Até</p>
                <SingleDatePicker value={historyToDate} onChange={setHistoryToDate} placeholder="Data final" min={MIN_INGEST_DATE} />
              </div>
            </div>

            <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-2 text-xs text-gray-600 inline-flex items-center gap-2 shrink-0">
              <span className="font-semibold text-gray-900">{filteredEntries.length}</span>
              <span>resultado(s) visível(eis)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {historyLoading ? (
          <div className="rounded-2xl border border-dashed border-surface-200 bg-white px-5 py-10 text-sm text-gray-500 text-center shadow-card">
            A carregar histórico guardado no Supabase...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-200 bg-white px-5 py-10 text-sm text-gray-500 text-center shadow-card">
            Ainda não existe histórico guardado para este utilizador, ou nenhum registo corresponde aos filtros atuais.
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <details key={entry.id} className="rounded-2xl border border-surface-200 bg-white shadow-card overflow-hidden">
              <summary className="cursor-pointer list-none px-5 py-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between hover:bg-surface-50 transition-colors">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${entry.status === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                      {entry.status === "success" ? "Sucesso" : "Erro"}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-surface-200 bg-surface-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                      {historyCategoryLabel(entry.category)}
                    </span>
                    {entry.range?.fromDate && entry.range?.toDate && (
                      <span className="text-xs text-gray-500">{entry.range.fromDate} → {entry.range.toDate}</span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">{entry.title}</h4>
                  <p className="text-xs text-gray-500">{formatHistoryTimestamp(entry.at)}</p>
                </div>

                <div className="text-xs text-gray-500 md:text-right">
                  <p>{entry.steps.length} passo(s)</p>
                  <p>{entry.note ?? "Histórico local guardado no navegador."}</p>
                </div>
              </summary>

              <div className="px-5 pb-5 pt-0 space-y-4 border-t border-surface-100 bg-white">
                {entry.steps.map((step) => (
                  <div key={`${entry.id}-${step.fn}-${step.label}`} className="rounded-xl border border-surface-200 bg-surface-50 p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${historyStepBadgeClass(step.status)}`}>
                        {step.status === "success" ? "Sucesso" : "Erro"}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{step.label}</span>
                      <span className="text-xs text-gray-500">{step.fn}</span>
                    </div>

                    {step.summary.length > 0 && (
                      <ul className="space-y-1 text-sm text-gray-700">
                        {step.summary.map((item) => (
                          <li key={`${entry.id}-${step.fn}-${item}`} className="rounded-lg bg-white border border-surface-200 px-3 py-2">
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="text-xs bg-brand-50 border border-brand-200 text-brand-800 rounded-xl px-4 py-3 font-mono overflow-auto max-h-40 break-all whitespace-pre-wrap">
                      {JSON.stringify(compactValue(step.payload), null, 2)}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}