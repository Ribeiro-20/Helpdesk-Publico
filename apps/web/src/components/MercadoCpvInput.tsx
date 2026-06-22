"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import InfoPopover from "@/components/InfoPopover";

type CpvSuggestion = {
  id: string;
  descricao: string;
};

type MercadoCpvInputProps = {
  defaultValue: string;
  label?: string;
  placeholder?: string;
  infoText?: string;
  inputClassName?: string;
  debounceMs?: number;
};

export default function MercadoCpvInput({
  defaultValue,
  label = "CPV",
  placeholder = "Insira o código CPV",
  infoText = "Indique o código CPV que pretende pesquisar",
  inputClassName = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all",
  debounceMs = 0,
}: MercadoCpvInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<CpvSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setValue((current) => {
      if (defaultValue === "" && current !== "") return "";
      return current;
    });
  }, [defaultValue]);

  useEffect(() => {
    const nextValue = value.trim();

    if (suggestionTimerRef.current) {
      clearTimeout(suggestionTimerRef.current);
    }

    if (nextValue.length < 2 || !/^[0-9-]+$/.test(nextValue)) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    suggestionTimerRef.current = setTimeout(() => {
      void fetch(`/api/cpv-search?q=${encodeURIComponent(nextValue)}&limit=8`, {
        signal: controller.signal,
        credentials: "same-origin",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Falha ao carregar sugestões CPV.");
          return response.json() as Promise<CpvSuggestion[] | { error?: string }>;
        })
        .then((payload) => {
          if (Array.isArray(payload)) {
            setSuggestions(payload);
            setIsOpen(payload.length > 0);
          } else {
            setSuggestions([]);
            setIsOpen(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setIsOpen(false);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, 180);

    return () => {
      controller.abort();
      if (suggestionTimerRef.current) {
        clearTimeout(suggestionTimerRef.current);
      }
    };
  }, [value]);

  const submitForm = useCallback((delayMs: number, overrideCpv?: string) => {
    if (submitTimerRef.current) {
      clearTimeout(submitTimerRef.current);
    }
    submitTimerRef.current = setTimeout(() => {
      const form = wrapperRef.current?.closest("form");
      if (!(form instanceof HTMLFormElement)) return;

      const formData = new FormData(form);
      const params = new URLSearchParams();

      formData.forEach((val, key) => {
        if (typeof val === "string" && val.trim() !== "") {
          if (key === "cpv" && overrideCpv !== undefined) return;
          if (val && val !== "all") {
            params.append(key, val);
          }
        }
      });

      const cpvToSet =
        overrideCpv !== undefined ? overrideCpv : formData.get("cpv");
      if (typeof cpvToSet === "string" && cpvToSet.trim() !== "") {
        params.set("cpv", cpvToSet.trim());
      }

      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    }, delayMs);
  }, [pathname, router]);

  useEffect(() => {
    const form = wrapperRef.current?.closest("form");
    if (!form) return;

    const submitHandler = (e: SubmitEvent) => {
      e.preventDefault();
      submitForm(0);
    };

    form.addEventListener("submit", submitHandler);
    return () => form.removeEventListener("submit", submitHandler);
  }, [submitForm]);

  function handleChange(nextValue: string) {
    setValue(nextValue);

    // Auto-search without reloading the page or losing focus
    submitForm(debounceMs, nextValue);
  }

  function handleSuggestionPick(suggestion: CpvSuggestion) {
    setValue(suggestion.id);
    setSuggestions([]);
    setIsOpen(false);
    submitForm(0, suggestion.id);
  }

  const hasSuggestions = isOpen && suggestions.length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-1 mb-1">
        <label htmlFor="mercado-cpv" className="block text-xs text-gray-400">
          {label}
        </label>
        <InfoPopover text={infoText} ariaLabel="Ajuda CPV" />
      </div>

      <input
        id="mercado-cpv"
        name="cpv"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setIsOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 120);
        }}
        autoComplete="off"
        placeholder={placeholder}
        className={inputClassName}
      />

      {isLoading && value.trim().length >= 2 && /^[0-9-]+$/.test(value.trim()) && (
        <p className="mt-1 text-[11px] text-gray-400">A procurar CPVs...</p>
      )}

      {hasSuggestions && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-surface-200 bg-white shadow-lg">
          <div className="max-h-72 overflow-auto py-1">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSuggestionPick(suggestion)}
                className="block w-full px-3 py-2 text-left transition-colors hover:bg-brand-50"
              >
                <div className="text-sm font-semibold text-gray-900">{suggestion.id}</div>
                <div className="text-xs text-gray-500">{suggestion.descricao}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
