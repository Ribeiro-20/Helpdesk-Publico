"use client";

import { useEffect, useRef, useState } from "react";
import InfoPopover from "@/components/InfoPopover";

type CpvOption = {
  id: string;
  descricao: string;
};

export default function MercadoCpvInput({
  defaultValue,
}: {
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [results, setResults] = useState<CpvOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function submitForm(delayMs: number) {
    if (submitTimerRef.current) {
      clearTimeout(submitTimerRef.current);
    }
    submitTimerRef.current = setTimeout(() => {
      const form = wrapperRef.current?.closest("form");
      if (!(form instanceof HTMLFormElement)) return;
      form.requestSubmit();
    }, delayMs);
  }

  async function searchCpv(query: string) {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/cpv-search?q=${encodeURIComponent(trimmed)}&limit=8`,
      );
      const data = (await response.json()) as CpvOption[];
      setResults(Array.isArray(data) ? data : []);
      setOpen(Array.isArray(data) && data.length > 0);
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      void searchCpv(nextValue);
    }, 250);

    // Auto-search only on CPV field while typing.
    submitForm(500);
  }

  function applySuggestion(cpv: string) {
    setValue(cpv);
    setOpen(false);
    setResults([]);
    submitForm(0);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-1 mb-1">
        <label
          htmlFor="mercado-cpv"
          className="block text-xs text-gray-400"
        >
          CPV
        </label>
        <InfoPopover
          text="Escreva o inicio do codigo (ex: 331). A pesquisa filtra por prefixo de CPV, como no BASE."
          ariaLabel="Ajuda CPV"
        />
      </div>

      <input
        id="mercado-cpv"
        name="cpv"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        autoComplete="off"
        placeholder="CPV (ex: 331 ou 45000000)"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
      />

      {loading && (
        <span className="absolute right-3 top-8 text-xs text-gray-400">...</span>
      )}

      {open && results.length > 0 && (
        <ul className="absolute z-40 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => applySuggestion(item.id)}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
              >
                <p className="text-xs text-gray-500 font-mono">{item.id}</p>
                <p className="text-sm text-gray-700 line-clamp-1">{item.descricao}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
