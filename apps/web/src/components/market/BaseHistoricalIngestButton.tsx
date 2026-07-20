"use client";

import { useState } from "react";

type IngestResponse = {
  ok: boolean;
  message: string;
  details?: unknown;
};

export default function BaseHistoricalIngestButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  async function runHistoricalIngest() {
    if (loading) return;
    setLoading(true);
    setMessage(null);
    setOk(null);

    try {
      const res = await fetch("/api/admin/ingest-dr/historical-base", {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as IngestResponse | null;

      if (!res.ok || !json?.ok) {
        setOk(false);
        setMessage(json?.message ?? "Falha ao iniciar ingestão histórica.");
      } else {
        setOk(true);
        setMessage(json.message);
      }
    } catch {
      setOk(false);
      setMessage("Erro de ligação ao iniciar ingestão histórica.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={runHistoricalIngest}
        disabled={loading}
        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 shadow-card transition-all hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "A correr ingestão histórica..." : "Ingestão BASE 2024-2026 (temporário)"}
      </button>
      {message && (
        <p className={`text-xs ${ok ? "text-emerald-700" : "text-red-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
