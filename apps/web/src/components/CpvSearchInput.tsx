"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export type CpvCode = { id: string; descricao: string };

export default function CpvSearchInput({
  selected,
  onToggle,
  className,
}: {
  selected: CpvCode[];
  onToggle: (cpv: CpvCode) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CpvCode[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const selectedIds = new Set((selected ?? []).map((c) => c.id));

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
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 300);
  }

  function handleToggle(cpv: CpvCode) {
    onToggle(cpv);
    // dropdown stays open
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      handleToggle(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Pesquisar CPV (ex: sementes, 7124...)"
        className={className}
      />

      {loading && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          ...
        </span>
      )}

      {open && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-surface-200 rounded-xl shadow-card max-h-60 overflow-y-auto">
          {results.map((cpv, i) => {
            const isSelected = selectedIds.has(cpv.id);
            return (
              <li
                key={cpv.id}
                onClick={() => handleToggle(cpv)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`px-3 py-2.5 text-sm cursor-pointer flex items-center gap-2.5 border-b border-surface-100 last:border-0 transition-colors ${
                  isSelected
                    ? "bg-brand-50"
                    : i === activeIdx
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
                <span className="font-mono text-xs text-gray-400">{cpv.id}</span>
                <span className="text-gray-700">{cpv.descricao}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
