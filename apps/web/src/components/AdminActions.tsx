"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

interface Action {
  fn: string;
  label: string;
  variant: "primary" | "secondary" | "init";
  body?: Record<string, unknown>;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultDates() {
  const today = new Date();
  const minus2 = new Date(today);
  minus2.setDate(minus2.getDate() - 2);
  return { from: isoDate(minus2), to: isoDate(today) };
}

const BTN_BASE = "text-sm font-medium px-4 py-2 rounded-xl transition-all disabled:opacity-40";
const BTN_STYLES: Record<string, string> = {
  primary: `${BTN_BASE} bg-brand-600 hover:bg-brand-700 text-white shadow-sm hover:shadow-md`,
  secondary: `${BTN_BASE} bg-white border border-surface-200 text-gray-700 hover:bg-surface-50 hover:border-gray-300 shadow-card`,
  init: `${BTN_BASE} bg-brand-600 hover:bg-brand-700 text-white shadow-sm hover:shadow-md`,
};
const INPUT_CLASS = "border border-surface-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all bg-white";

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

  const defaults = defaultDates();
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);

  const { url: supabaseUrl, anonKey } = getSupabasePublicEnv("Admin actions");
  const supabase = createClient();

  async function callFn(fn: string, body: Record<string, unknown> = {}) {
    setLoading(fn);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: anonKey,
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text.slice(0, 500) };
      }
      if (!res.ok) throw new Error((data as Record<string, string>)?.error ?? `HTTP ${res.status}`);

      setResults((prev) => [{ fn, data }, ...prev.slice(0, 4)]);

      if (fn === "admin-seed") window.location.reload();
    } catch (e) {
      setError(`${fn}: ${String(e)}`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Ingest date range */}
      {isInitialised && (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Intervalo de ingestão
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">De</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ate</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {!isInitialised && (
          <button
            onClick={() => callFn("admin-seed")}
            disabled={!!loading}
            className={BTN_STYLES.init}
          >
            {loading === "admin-seed" ? "A inicializar..." : "Inicializar Sistema"}
          </button>
        )}

        {actions.map(({ fn, label, variant, body }) => {
          const needsDates =
            fn === "ingest-base" || fn === "ingest-contracts" || fn === "match-and-queue";
          const effectiveBody = needsDates
            ? { ...body, from_date: fromDate, to_date: toDate }
            : body ?? {};

          return (
            <button
              key={`${fn}-${label}`}
              onClick={() => callFn(fn, effectiveBody)}
              disabled={!!loading}
              className={BTN_STYLES[variant] ?? BTN_STYLES.secondary}
            >
              {loading === fn ? "A processar..." : label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="text-sm bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Progress indicator */}
      {loading && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm">
          <svg className="animate-spin h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>A executar <strong>{loading}</strong>... isto pode demorar alguns minutos.</span>
        </div>
      )}

      {results.map(({ fn, data }, i) => (
        <div
          key={i}
          className="text-xs bg-brand-50 border border-brand-200 text-brand-800 rounded-xl px-4 py-3 font-mono overflow-auto max-h-40 break-all"
        >
          <strong>{fn}:</strong> {JSON.stringify(data, null, 2)}
        </div>
      ))}
    </div>
  );
}
