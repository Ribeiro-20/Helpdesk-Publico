"use client";

import { useEffect, useState } from "react";
import { historicalProgress } from "@/lib/historical-ingestion";

type JobKind = "announcements" | "contracts";
type HistoricalJob = {
  id: string;
  kind: JobKind;
  status: "queued" | "running" | "completed" | "failed";
  current_window: number;
  total_windows: number;
  fetched_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  public_error: string | null;
};

type JobResponse = { ok: boolean; message?: string; job?: HistoricalJob | null };

export default function BaseHistoricalIngestButton({
  analysisType,
}: {
  analysisType: "announcements" | "contracts";
}) {
  const [job, setJob] = useState<HistoricalJob | null>(null);
  const [enqueueing, setEnqueueing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(`/api/admin/ingest-dr/historical-base?kind=${analysisType}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await response.json().catch(() => null)) as JobResponse | null;
        if (!cancelled && response.ok && json?.ok) setJob(json.job ?? null);
      } catch {
        // A próxima consulta volta a tentar; o worker continua independente do browser.
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [analysisType]);

  async function runHistoricalIngest() {
    if (enqueueing || job?.status === "queued" || job?.status === "running") return;
    setEnqueueing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/ingest-dr/historical-base", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: analysisType }),
      });
      const json = (await response.json().catch(() => null)) as JobResponse | null;
      if (!response.ok || !json?.ok) {
        setMessage(json?.message ?? "Falha ao agendar a ingestão histórica.");
        return;
      }
      setJob(json.job ?? null);
      setMessage(json.message ?? "Ingestão histórica colocada em fila.");
    } catch {
      setMessage("Erro de ligação ao agendar a ingestão histórica.");
    } finally {
      setEnqueueing(false);
    }
  }

  const active = job?.status === "queued" || job?.status === "running";
  const progress = job ? historicalProgress(job.current_window, job.total_windows) : 0;
  const subject = analysisType === "announcements" ? "anúncios" : "contratos";
  const buttonLabel = enqueueing
    ? "A agendar..."
    : active
      ? `Ingestão de ${subject}: ${progress}%`
      : job?.status === "failed"
        ? `Retomar ingestão de ${subject}`
        : `Ingerir ${subject} desde 2024`;

  return (
    <div className="flex min-w-64 flex-col gap-2">
      <button
        type="button"
        onClick={runHistoricalIngest}
        disabled={enqueueing || active}
        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 shadow-card transition-all hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {buttonLabel}
      </button>
      {active && job && (
        <div className="h-1.5 overflow-hidden rounded-full bg-amber-100" aria-label={`Progresso ${progress}%`}>
          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {job?.status === "completed" && (
        <p className="text-xs text-emerald-700">
          {analysisType === "contracts"
            ? `Concluída: ${job.fetched_count} contratos processados.`
            : `Concluída: ${job.inserted_count} inseridos, ${job.updated_count} actualizados.`}
        </p>
      )}
      {job?.status === "failed" && (
        <p className="text-xs text-red-600">{job.public_error ?? "A ingestão falhou. Podes retomá-la."}</p>
      )}
      {message && <p className="text-xs text-gray-600">{message}</p>}
    </div>
  );
}
