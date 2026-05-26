"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SingleDatePicker from "@/components/SingleDatePicker";

interface Action {
  fn: string;
  label: string;
  variant: "primary" | "secondary" | "init";
  body?: Record<string, unknown>;
}

interface ActionGroup {
  key: string;
  title: string;
  actions: Action[];
}

const ANN_WARNING_DAYS = 16;
const ANN_MAX_DAYS = 31;
const CONTRACT_WARNING_DAYS = 8;
const CONTRACT_MAX_DAYS = 15;
const MIN_INGEST_DATE = "2026-01-01";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultDates() {
  const today = new Date();
  const minus2 = new Date(today);
  minus2.setDate(minus2.getDate() - 2);
  return { from: isoDate(minus2), to: isoDate(today) };
}

function groupActions(actions: Action[]): ActionGroup[] {
  const groups: ActionGroup[] = [
    { key: "ingestion", title: "Ingestão", actions: [] },
    { key: "extraction", title: "Extração", actions: [] },
    { key: "processing", title: "Processamento", actions: [] },
  ];

  for (const action of actions) {
    if (
      action.fn === "ingest-base" ||
      action.fn === "delete-announcements" ||
      action.fn === "ingest-contracts" ||
      action.fn === "ingest-contract-mods"
    ) {
      groups[0].actions.push(action);
      continue;
    }

    if (action.fn === "extract-entities" || action.fn === "extract-companies") {
      groups[1].actions.push(action);
      continue;
    }

    groups[2].actions.push(action);
  }

  return groups.filter((group) => group.actions.length > 0);
}

function diffDaysInclusive(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.floor((to - from) / 86400000) + 1;
}

function listDatesInclusive(fromDate: string, toDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function aggregateNumericField(data: unknown, field: string) {
  if (typeof data !== "object" || data === null) return 0;
  const value = (data as Record<string, unknown>)[field];
  return typeof value === "number" ? value : 0;
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function validateBaseRange(fromDate: string, toDate: string) {
  if (!fromDate || !toDate) return "Selecione as duas datas.";
  if (fromDate < MIN_INGEST_DATE || toDate < MIN_INGEST_DATE) {
    return `A ingestao manual so permite datas a partir de ${MIN_INGEST_DATE}.`;
  }
  if (fromDate > toDate) return "A data inicial tem de ser anterior ou igual a data final.";
  return null;
}

function getRangePolicy(fn: string, fromDate: string, toDate: string) {
  const baseError = validateBaseRange(fromDate, toDate);
  if (baseError) return { disabled: true, warning: null as string | null, error: baseError };

  const days = diffDaysInclusive(fromDate, toDate);

  if (fn === "ingest-base" || fn === "ingest-dr" || fn === "delete-announcements") {
    if (days > ANN_MAX_DAYS) {
      return {
        disabled: true,
        warning: null,
        error: `Intervalo demasiado grande para anuncios (${days} dias). Use blocos de ate ${ANN_MAX_DAYS} dias.`,
      };
    }
    if (days > ANN_WARNING_DAYS) {
      return {
        disabled: false,
        warning: `Anuncios: ${days} dias pode demorar. Prefira blocos quinzenais.`,
        error: null,
      };
    }
  }

  if (fn === "ingest-contracts") {
    if (days > CONTRACT_MAX_DAYS) {
      return {
        disabled: true,
        warning: null,
        error: `Intervalo demasiado grande para contratos (${days} dias). Use blocos de ate ${CONTRACT_MAX_DAYS} dias.`,
      };
    }
    if (days > CONTRACT_WARNING_DAYS) {
      return {
        disabled: false,
        warning: `Contratos: ${days} dias tem risco elevado de demorar. Prefira blocos semanais.`,
        error: null,
      };
    }
  }

  return { disabled: false, warning: null as string | null, error: null as string | null };
}

const BTN_BASE = "text-sm font-medium px-4 py-2 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed";
const BTN_STYLES: Record<string, string> = {
  primary: `${BTN_BASE} bg-brand-600 hover:bg-brand-700 text-white shadow-sm hover:shadow-md`,
  secondary: `${BTN_BASE} bg-white border border-surface-200 text-gray-700 hover:bg-surface-50 hover:border-gray-300 shadow-card`,
  init: `${BTN_BASE} bg-brand-600 hover:bg-brand-700 text-white shadow-sm hover:shadow-md`,
};

export default function AdminActions({
  actions,
  isInitialised,
}: {
  actions: Action[];
  isInitialised: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ fn: string; data: unknown }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const defaults = defaultDates();
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const groupedActions = groupActions(actions);

  const router = useRouter();
  const supabase = createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const globalDateError = useMemo(() => validateBaseRange(fromDate, toDate), [fromDate, toDate]);
  const announcementsPolicy = useMemo(() => getRangePolicy("ingest-base", fromDate, toDate), [fromDate, toDate]);
  const contractsPolicy = useMemo(() => getRangePolicy("ingest-contracts", fromDate, toDate), [fromDate, toDate]);
  const drPolicy = useMemo(() => getRangePolicy("ingest-dr", fromDate, toDate), [fromDate, toDate]);
  const deleteAnnouncementsPolicy = useMemo(() => getRangePolicy("delete-announcements", fromDate, toDate), [fromDate, toDate]);

  async function callFn(fn: string, body: Record<string, unknown> = {}) {
    setLoading(fn);
    setError(null);
    setInfo(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

      const runCall = async (targetFn: string, requestBody: Record<string, unknown>) => {
        const res = await fetch(`${supabaseUrl}/functions/v1/${targetFn}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: anonKey,
          },
          body: JSON.stringify(requestBody),
        });

        const text = await res.text();
        let data: unknown;

        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text.slice(0, 500) };
        }

        return { res, data };
      };

      const runDrIngest = async (requestBody: Record<string, unknown>) => {
        const res = await fetch("/api/admin/ingest-dr", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return { res, data };
      };

      const runContractsIngest = async (requestBody: Record<string, unknown>) => {
        const res = await fetch("/api/admin/ingest-contracts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return { res, data };
      };

      if (fn === "ingest-base") {
        const isDryRun = body.dry_run === true;
        const rangeBody =
          typeof body.from_date === "string" && typeof body.to_date === "string"
            ? { from_date: body.from_date, to_date: body.to_date }
            : {};

        setInfo("A ingerir anúncios BASE...");
        const { res: baseRes, data: baseData } = await runCall("ingest-base", body);
        const baseError = baseRes.ok ? null : (baseData as Record<string, string>)?.error ?? `HTTP ${baseRes.status}`;

        if (isDryRun) {
          setInfo("Dry run de anúncios concluído.");
          setResults((prev) => [{ fn, data: baseData }, ...prev.slice(0, 4)]);
          router.refresh();
          return;
        }

        const fetched = baseRes.ok ? aggregateNumericField(baseData, "fetched") : 0;
        if (fetched <= 0) {
          const canRunDrToday =
            typeof body.from_date === "string" &&
            typeof body.to_date === "string" &&
            body.from_date === body.to_date &&
            body.to_date === todayIso();

          if (baseError) {
            setInfo(`A API BASE falhou (${baseError}). A tentar ingestão DR na mesma...`);
          }

          if (canRunDrToday) {
            setInfo(baseError ? `A API BASE falhou (${baseError}). A tentar ingestão DR de hoje...` : "Sem novos anúncios BASE. A tentar ingestão DR de hoje...");
            const { res: drRes, data: drData } = await runDrIngest(rangeBody);
            if (!drRes.ok) {
              throw new Error((drData as Record<string, string>)?.error ?? `HTTP ${drRes.status}`);
            }

            setInfo("Sem novos anúncios BASE. A processar correspondência CPV...");
            const { res: mqRes, data: mqData } = await runCall("match-and-queue", rangeBody);
            if (!mqRes.ok) {
              throw new Error((mqData as Record<string, string>)?.error ?? `HTTP ${mqRes.status}`);
            }

            const pipelineData = {
              ingest_base: baseData,
              ingest_dr: drData,
              match_and_queue: mqData,
            };

            setInfo("Sem novos anúncios BASE. DR de hoje e correspondência CPV concluídos.");
            setResults((prev) => [{ fn: "ingest-base (base=0, dr-hoje + cpv)", data: pipelineData }, ...prev.slice(0, 4)]);
            router.refresh();
            return;
          }

          setInfo(
            baseError
              ? `A API BASE falhou (${baseError}). A processar correspondência CPV nos anúncios já existentes do intervalo...`
              : "Sem novos anúncios BASE. A processar correspondência CPV nos anúncios já existentes do intervalo...",
          );
          const { res: mqRes, data: mqData } = await runCall("match-and-queue", rangeBody);
          if (!mqRes.ok) {
            throw new Error((mqData as Record<string, string>)?.error ?? `HTTP ${mqRes.status}`);
          }

          const pipelineData = {
            ingest_base: baseData,
            ingest_base_error: baseError,
            ingest_dr: { skipped: true, reason: "no_new_base_announcements" },
            match_and_queue: mqData,
          };

          setInfo(
            baseError
              ? `A API BASE falhou (${baseError}). Correspondência CPV executada nos anúncios existentes.`
              : "Sem novos anúncios BASE. Correspondência CPV executada nos anúncios existentes.",
          );
          setResults((prev) => [{ fn: "ingest-base (base=0, cpv executado)", data: pipelineData }, ...prev.slice(0, 4)]);
          router.refresh();
          return;
        }

        if (baseError) {
          setInfo(`A API BASE falhou (${baseError}). A enriquecer anúncios com detalhe DR...`);
        } else {
          setInfo("A enriquecer anúncios com detalhe DR...");
        }
        const { res: drRes, data: drData } = await runDrIngest(rangeBody);
        if (!drRes.ok) {
          throw new Error((drData as Record<string, string>)?.error ?? `HTTP ${drRes.status}`);
        }

        setInfo("A processar correspondência CPV...");
        const { res: mqRes, data: mqData } = await runCall("match-and-queue", rangeBody);
        if (!mqRes.ok) {
          throw new Error((mqData as Record<string, string>)?.error ?? `HTTP ${mqRes.status}`);
        }

        const pipelineData = {
          ingest_base: baseData,
          ingest_base_error: baseError,
          ingest_dr: drData,
          match_and_queue: mqData,
        };

        setInfo(
          baseError
            ? `A API BASE falhou (${baseError}). DR + correspondência CPV concluídos.`
            : "Pipeline de anúncios concluído: BASE + DR + correspondência CPV.",
        );
        setResults((prev) => [{ fn: "ingest-base (pipeline)", data: pipelineData }, ...prev.slice(0, 4)]);
        router.refresh();
        return;
      }

      if (
        fn === "ingest-contracts" &&
        typeof body.from_date === "string" &&
        typeof body.to_date === "string"
      ) {
        setInfo(`A ingerir contratos de ${body.from_date} até ${body.to_date}...`);
        const { res, data } = await runContractsIngest(body);
        if (!res.ok) {
          throw new Error((data as Record<string, string>)?.error ?? `HTTP ${res.status}`);
        }

        setInfo(`Contratos ingeridos com sucesso para o intervalo ${body.from_date}..${body.to_date}.`);
        setResults((prev) => [{ fn, data }, ...prev.slice(0, 4)]);
        router.refresh();
        return;
      }

      let { res, data } = await runCall(fn, body);
      const isWorkerLimitError =
        res.status === 546 ||
        (typeof data === "object" &&
          data !== null &&
          String((data as { message?: string; error?: string }).message ?? (data as { message?: string; error?: string }).error ?? "").includes("WORKER_LIMIT"));

      if (!res.ok && fn === "ingest-contracts" && isWorkerLimitError) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        ({ res, data } = await runCall(fn, body));
      }

      if (!res.ok) throw new Error((data as Record<string, string>)?.error ?? `HTTP ${res.status}`);

      setResults((prev) => [{ fn, data }, ...prev.slice(0, 4)]);
      router.refresh();
      if (fn === "admin-seed") window.location.reload();
    } catch (e) {
      setError(`${fn}: ${formatUnknownError(e)}`);
    } finally {
      setLoading(null);
    }
  }

  async function callInternalApi(fn: string, body: Record<string, unknown> = {}) {
    setLoading(fn);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch("/api/admin/ingest-dr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) throw new Error((data as Record<string, string>)?.error ?? `HTTP ${res.status}`);

      if (
        fn === "ingest-dr" &&
        typeof data === "object" &&
        data !== null &&
        (data as { normalized_candidates?: unknown }).normalized_candidates === 0
      ) {
        setInfo("Não foram encontrados anúncios DR para o intervalo selecionado.");
      }

      setResults((prev) => [{ fn, data }, ...prev.slice(0, 4)]);
      router.refresh();
    } catch (e) {
      setError(`${fn}: ${formatUnknownError(e)}`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {isInitialised && (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Intervalo de ingestao
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1 text-xs text-gray-400">De</p>
              <SingleDatePicker value={fromDate} onChange={setFromDate} placeholder="Data início" min={MIN_INGEST_DATE} />
            </div>
            <div>
              <p className="mb-1 text-xs text-gray-400">Até</p>
              <SingleDatePicker value={toDate} onChange={setToDate} placeholder="Data fim" min={MIN_INGEST_DATE} />
            </div>
          </div>

          {globalDateError && (
            <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
              {globalDateError}
            </div>
          )}

          {!globalDateError && (announcementsPolicy.warning || contractsPolicy.warning || drPolicy.warning) && (
            <div className="space-y-2">
              {announcementsPolicy.warning && (
                <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3">
                  {announcementsPolicy.warning}
                </div>
              )}
              {contractsPolicy.warning && (
                <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3">
                  {contractsPolicy.warning}
                </div>
              )}
              {drPolicy.warning && !announcementsPolicy.warning && (
                <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3">
                  {drPolicy.warning}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-gray-500">
            Limites: anuncios ate {ANN_MAX_DAYS} dias e contratos ate {CONTRACT_MAX_DAYS} dias, devido a quantidade de dados processados pela API BASE em cada pedido.
          </p>
        </div>
      )}

      {!isInitialised && (
        <div>
          <button
            onClick={() => callFn("admin-seed")}
            disabled={!!loading}
            className={BTN_STYLES.init}
          >
            {loading === "admin-seed" ? "A inicializar..." : "Inicializar Sistema"}
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {groupedActions.map((group) => (
          <div key={group.key} className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">{group.title}</h3>
            <div className="flex flex-wrap gap-2">
              {group.actions.map(({ fn, label, variant, body }) => {
                const needsDates =
                  fn === "ingest-base" ||
                  fn === "delete-announcements" ||
                  fn === "ingest-contracts" ||
                  fn === "match-and-queue" ||
                  fn === "ingest-dr";
                const policy = fn === "ingest-base"
                  ? announcementsPolicy
                  : fn === "delete-announcements"
                  ? deleteAnnouncementsPolicy
                  : fn === "ingest-contracts"
                  ? contractsPolicy
                  : fn === "ingest-dr"
                  ? drPolicy
                  : { disabled: !!globalDateError, warning: null, error: globalDateError };
                const effectiveBody = needsDates ? { ...body, from_date: fromDate, to_date: toDate } : body ?? {};
                const isInternalApiAction = fn === "ingest-dr";
                const disabled = !!loading || (needsDates && policy.disabled);
                const title = policy.error ?? undefined;

                return (
                  <button
                    key={`${fn}-${label}`}
                    onClick={() => {
                      if (fn === "delete-announcements") {
                        const confirmDelete = window.confirm(
                          `Tem a certeza que quer apagar anúncios entre ${fromDate} e ${toDate}?\n\nIsto também remove notificações e versões associadas a esses anúncios.`,
                        );
                        if (!confirmDelete) return;
                      }

                      if (isInternalApiAction) {
                        void callInternalApi(fn, effectiveBody);
                        return;
                      }
                      void callFn(fn, effectiveBody);
                    }}
                    disabled={disabled}
                    title={title}
                    className={BTN_STYLES[variant] ?? BTN_STYLES.secondary}
                  >
                    {loading === fn ? "A processar..." : label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="text-sm bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {info && (
        <div className="text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3">
          {info}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm">
          <svg className="animate-spin h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>A executar <strong>{loading}</strong>... isto pode demorar alguns minutos.</span>
        </div>
      )}

      {results.map(({ fn, data }, index) => (
        <div
          key={index}
          className="text-xs bg-brand-50 border border-brand-200 text-brand-800 rounded-xl px-4 py-3 font-mono overflow-auto max-h-40 break-all"
        >
          <strong>{fn}:</strong> {JSON.stringify(data, null, 2)}
        </div>
      ))}
    </div>
  );
}
