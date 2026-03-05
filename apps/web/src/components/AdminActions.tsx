"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

  const supabase = createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  async function callFn(fn: string, body: Record<string, unknown> = {}) {
    setLoading(fn);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

      const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: anonKey,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

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
            Intervalo de ingestao
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
          const effectiveBody =
            fn === "ingest-base"
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

      {results.map(({ fn, data }, i) => (
        <div
          key={i}
          className="text-xs bg-brand-50 border border-brand-200 text-brand-800 rounded-xl px-4 py-3 font-mono"
        >
          <strong>{fn}:</strong> {JSON.stringify(data)}
        </div>
      ))}
    </div>
  );
}
