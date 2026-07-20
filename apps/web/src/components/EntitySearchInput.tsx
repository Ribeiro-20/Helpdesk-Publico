"use client";

import { useMemo, useState } from "react";

type EntityOption = {
  name: string;
  nif: string | null;
};

type EntitySearchInputProps = {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  options: EntityOption[];
  minChars?: number;
};

function normalizeForSearch(value: string): string {
  return value
    .toLocaleLowerCase("pt-PT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function EntitySearchInput({
  name,
  defaultValue = "",
  placeholder,
  className,
  options,
  minChars = 2,
}: EntitySearchInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [isFocused, setIsFocused] = useState(false);

  const normalizedValue = normalizeForSearch(value);
  const digitsValue = value.replace(/\D/g, "");

  const filteredOptions = useMemo(() => {
    if (normalizedValue.length < minChars && digitsValue.length < minChars) return [];

    const terms = normalizedValue.split(" ").filter((term) => term.length >= 2);
    return options
      .filter((option) => {
        const normalizedName = normalizeForSearch(option.name);
        const matchesText = terms.length === 0
          ? normalizedName.includes(normalizedValue)
          : terms.every((term) => normalizedName.includes(term));

        const optionNif = (option.nif ?? "").replace(/\D/g, "");
        const matchesNif = digitsValue.length >= minChars && optionNif.includes(digitsValue);

        return matchesText || matchesNif;
      })
      .slice(0, 12);
  }, [digitsValue, minChars, normalizedValue, options]);

  const shouldShow = isFocused && filteredOptions.length > 0 && (normalizedValue.length >= minChars || digitsValue.length >= minChars);

  return (
    <div className="relative">
      <input
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          // Delay close so click on suggestion can be applied first.
          setTimeout(() => setIsFocused(false), 100);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />

      {shouldShow && (
        <div className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
          {filteredOptions.map((option) => (
            <button
              key={`${option.name}-${option.nif ?? "none"}`}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                setValue(option.name);
                setIsFocused(false);
              }}
              className="w-full rounded-lg px-3 py-2 text-left hover:bg-surface-50"
            >
              <p className="text-sm font-medium text-gray-800">{option.name}</p>
              {option.nif && (
                <p className="text-xs text-gray-500">NIPC {option.nif}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
