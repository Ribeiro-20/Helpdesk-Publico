"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Option = {
  value: string;
  label: string;
  disabled?: boolean;
};

export default function MercadoSingleSelect({
  name,
  label,
  options,
  defaultValue,
  value,
  onChange,
  disabled = false,
  hideLabel = false,
  showHiddenInput = true,
  optionDensity = "default",
  autoSubmitOnChange = false,
}: {
  name: string;
  label?: string;
  options: Option[];
  defaultValue: string;
  value?: string;
  onChange?: (nextValue: string) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  showHiddenInput?: boolean;
  optionDensity?: "default" | "compact";
  autoSubmitOnChange?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(defaultValue);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : selected;
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isControlled) setSelected(defaultValue);
  }, [defaultValue, isControlled]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption =
    options.find((option) => option.value === currentValue) ?? options[0];

  const selectedLabel = selectedOption?.label ?? "";

  function submitClosestForm(nextValue?: string) {
    const form = wrapperRef.current?.closest("form");
    if (!(form instanceof HTMLFormElement)) return;

    const formData = new FormData(form);
    const params = new URLSearchParams();

    formData.forEach((val, key) => {
      if (key === name && nextValue !== undefined) return;
      if (typeof val !== "string") return;
      const cleaned = val.trim();
      if (!cleaned || cleaned === "all") return;
      params.append(key, cleaned);
    });

    if (nextValue !== undefined) {
      const cleanedNext = nextValue.trim();
      if (cleanedNext && cleanedNext !== "all") {
        params.set(name, cleanedNext);
      }
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div ref={wrapperRef} className={`relative ${open ? "z-[120]" : "z-10"}`}>
      {!hideLabel && label && <label className="block text-xs text-gray-400 mb-1">{label}</label>}

      {showHiddenInput && <input type="hidden" name={name} value={selectedOption?.value ?? ""} />}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all text-left disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
      >
        <span className="truncate pr-2 text-gray-700 disabled:text-gray-400">{selectedLabel}</span>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="absolute z-[130] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1">
          {options.map((opt) => {
            const isActive = selectedOption?.value === opt.value;
            const isDisabledOption = opt.disabled === true;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={isDisabledOption}
                onClick={() => {
                  if (!isControlled) setSelected(opt.value);
                  onChange?.(opt.value);
                  setOpen(false);
                  if (autoSubmitOnChange) submitClosestForm(opt.value);
                }}
                className={`flex items-center justify-between px-3.5 w-full cursor-pointer text-left transition-colors disabled:cursor-default disabled:hover:bg-transparent disabled:text-gray-300 ${
                  optionDensity === "compact" ? "py-1 min-h-[30px]" : "py-2.5 min-h-[42px]"
                } ${
                  isActive ? "bg-green-50 text-green-700" : "hover:bg-gray-50"
                }`}
              >
                <span className={`text-sm leading-snug ${isActive ? "font-medium text-green-700" : "text-gray-700"}`}>
                  {opt.label}
                </span>
                {isActive && (
                  <svg
                    className="w-4 h-4 text-green-600 shrink-0"
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
