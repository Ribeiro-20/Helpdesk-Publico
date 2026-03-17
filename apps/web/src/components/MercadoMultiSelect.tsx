"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Multi-select dropdown with checkboxes.
 * Persists selected values as hidden inputs so FormData picks them up correctly.
 * Scrollable after 8 items (each ~36px).
 */
export default function MercadoMultiSelect({
  name,
  label,
  options,
  defaultSelected,
}: {
  name: string;
  label: string;
  options: string[];
  defaultSelected: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(defaultSelected);
  }, [defaultSelected.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  const displayLabel =
    selected.length === 0
      ? "Todos"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selecionados`;

  return (
    <div ref={wrapperRef} className="relative z-10">
      <label className="block text-xs text-gray-400 mb-1">{label}</label>

      {/*
        Hidden inputs — one per selected value.
        These are what FormData (and native form submit) actually reads.
        They're always in the DOM, not inside the dropdown.
      */}
      {selected.map((val) => (
        <input key={val} type="hidden" name={name} value={val} />
      ))}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all text-left"
      >
        <span className="truncate pr-2 text-gray-700">{displayLabel}</span>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-y-auto"
          style={{ maxHeight: "calc(8 * 36px)" }}
        >
          {options.length === 0 && (
            <p className="px-3 py-4 text-xs text-gray-400 text-center">
              Sem opções disponíveis
            </p>
          )}
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className="flex items-center gap-2.5 px-3 w-full cursor-pointer hover:bg-gray-50 select-none min-h-[36px] text-left"
              >
                {/* Custom checkbox indicator */}
                <span
                  className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                    checked
                      ? "bg-green-500 border-green-500"
                      : "bg-white border-gray-300"
                  }`}
                >
                  {checked && (
                    <svg
                      className="w-3 h-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="3"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </span>
                <span className="text-xs text-gray-700 leading-snug">{opt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
