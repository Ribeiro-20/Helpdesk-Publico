"use client";

import { useEffect, useState } from "react";

function normalizeNipc(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/^PT/i, "").replace(/\D/g, "");
}

function parseDefaultValues(value?: string): string[] {
  return Array.from(
    new Set(
      (value ?? "")
        .split(/[;,\n]+/)
        .map((item) => normalizeNipc(item.trim()))
        .filter(Boolean),
    ),
  );
}

export default function NipcMultiInput({
  name = "nipc",
  defaultValue = "",
  label = "NIPC",
  placeholder = "Inserir NIPC e Enter",
}: {
  name?: string;
  defaultValue?: string;
  label?: string;
  placeholder?: string;
}) {
  const [selected, setSelected] = useState<string[]>(() => parseDefaultValues(defaultValue));
  const [query, setQuery] = useState("");

  useEffect(() => {
    setSelected(parseDefaultValues(defaultValue));
  }, [defaultValue]);

  function addNipc(raw: string) {
    const normalized = normalizeNipc(raw);
    if (!normalized) return;

    setSelected((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
  }

  function removeNipc(value: string) {
    setSelected((prev) => prev.filter((item) => item !== value));
  }

  function commitQuery() {
    if (!query.trim()) return;
    const parts = query.split(/[;,\n]+/);
    const last = parts.pop() ?? "";
    parts.forEach((value) => addNipc(value));
    if (!/[;,\n]+$/.test(query)) {
      setQuery(last);
    } else {
      addNipc(last);
      setQuery("");
    }
  }

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="rounded-xl border border-surface-200 bg-white px-3 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-500 transition-all">
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {selected.map((nipc) => (
            <span
              key={nipc}
              className="inline-flex max-w-full items-center gap-1.5 bg-brand-50 text-brand-800 text-xs px-2 py-1 rounded-full border border-brand-200"
            >
              <span className="font-mono whitespace-nowrap">{nipc}</span>
              <button
                type="button"
                onClick={() => removeNipc(nipc)}
                className="inline-flex items-center justify-center text-brand-400 hover:text-brand-700 ml-0.5"
                aria-label={`Remover NIPC ${nipc}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2">
          <input
            type="text"
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              if (/[;,\n]/.test(next)) {
                commitQuery();
              }
            }}
            onBlur={() => {
              addNipc(query);
              setQuery("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addNipc(query);
                setQuery("");
              }
            }}
            placeholder={placeholder}
            className="w-full border-0 p-0 text-sm focus:outline-none focus:ring-0 placeholder:text-gray-400"
          />
        </div>
      </div>
      <input type="hidden" name={name} value={selected.join(", ")} />
    </div>
  );
}
