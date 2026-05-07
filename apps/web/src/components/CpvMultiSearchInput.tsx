"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CpvCode = { id: string; descricao: string };

function parseDefaultValues(value?: string) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(/[;,\n]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).map((id) => ({ id, descricao: "" }));
}

export default function CpvMultiSearchInput({
  name = "cpv",
  defaultValue = "",
  label = "CPV",
  placeholder = "Pesquisar CPV (ex: sementes, 7124...)",
}: {
  name?: string;
  defaultValue?: string;
  label?: string;
  placeholder?: string;
}) {
  const [selected, setSelected] = useState<CpvCode[]>(() => parseDefaultValues(defaultValue));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CpvCode[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setSelected(parseDefaultValues(defaultValue));
  }, [defaultValue]);

  const selectedIds = useMemo(() => new Set(selected.map((item) => item.id)), [selected]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/cpv-search?q=${encodeURIComponent(q)}&limit=20`);
      const data: CpvCode[] = await res.json();
      setResults(data);
      setOpen(data.length > 0);
      setActiveIdx(-1);
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 300);
  }

  function addCpv(cpv: CpvCode) {
    setSelected((prev) => (prev.some((item) => item.id === cpv.id) ? prev : [...prev, cpv]));
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIdx(-1);
  }

  function removeCpv(id: string) {
    setSelected((prev) => prev.filter((item) => item.id !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "Enter" && query.trim()) {
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((index) => Math.min(index + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((index) => Math.max(index - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      addCpv(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-xs text-gray-400 mb-1">{label}</label>

      <div className="rounded-xl border border-surface-200 bg-white px-3 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-500 transition-all">
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {selected.map((cpv) => (
            <span
              key={cpv.id}
              className="inline-flex max-w-full items-center gap-1.5 bg-brand-50 text-brand-800 text-xs px-2 py-1 rounded-full border border-brand-200"
            >
              <span
                className="font-mono whitespace-nowrap"
                title={cpv.descricao ? `${cpv.id} - ${cpv.descricao}` : cpv.id}
              >
                {cpv.id}
              </span>
              {cpv.descricao ? (
                <span className="text-brand-600 truncate max-w-[140px]" title={cpv.descricao}>
                  {cpv.descricao}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => removeCpv(cpv.id)}
                className="inline-flex items-center justify-center text-brand-400 hover:text-brand-700 ml-0.5"
                aria-label={`Remover CPV ${cpv.id}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="relative mt-2">
          <input
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={placeholder}
            className="w-full border-0 p-0 pr-6 text-sm focus:outline-none focus:ring-0 placeholder:text-gray-400"
          />

          {loading && (
            <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-gray-400">...</span>
          )}
        </div>
      </div>

      <input type="hidden" name={name} value={selected.map((item) => item.id).join(", ")} />

      {open && (
        <ul className="absolute z-50 left-0 top-full mt-1 w-[36rem] max-w-[calc(100vw-2rem)] bg-white border border-surface-200 rounded-xl shadow-card max-h-60 overflow-y-auto">
          {results.map((cpv, index) => {
            const isSelected = selectedIds.has(cpv.id);
            return (
              <li
                key={cpv.id}
                onClick={() => addCpv(cpv)}
                onMouseEnter={() => setActiveIdx(index)}
                className={`px-3 py-2.5 text-sm cursor-pointer flex items-center gap-2.5 border-b border-surface-100 last:border-0 transition-colors min-w-0 ${
                  isSelected
                    ? "bg-brand-50"
                    : index === activeIdx
                      ? "bg-surface-50"
                      : "hover:bg-surface-50"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-xs transition-all ${
                    isSelected
                      ? "bg-brand-600 border-brand-600 text-white shadow-sm"
                      : "border border-surface-300"
                  }`}
                >
                  {isSelected && "✓"}
                </span>
                <span className="font-mono text-xs text-gray-400 shrink-0 whitespace-nowrap">{cpv.id}</span>
                <span className="flex-1 min-w-0 text-gray-700 truncate whitespace-nowrap" title={cpv.descricao}>
                  {cpv.descricao}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}