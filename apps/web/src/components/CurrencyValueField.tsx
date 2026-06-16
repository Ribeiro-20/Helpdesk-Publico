"use client";

import { useEffect, useState } from "react";

function sanitizeNumericValue(rawValue: string): string {
  const cleaned = rawValue.replace(/[^\d.,]/g, "").replace(/,/g, ".");
  const [integerPart, ...decimalParts] = cleaned.split(".");
  const decimalPart = decimalParts.join("");

  if (!integerPart && !decimalPart) return "";
  return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
}

type CurrencyValueFieldProps = {
  name: string;
  label: string;
  defaultValue: string;
  placeholder: string;
};

export default function CurrencyValueField({
  name,
  label,
  defaultValue,
  placeholder,
}: CurrencyValueFieldProps) {
  const [value, setValue] = useState(() => sanitizeNumericValue(defaultValue));

  useEffect(() => {
    setValue(sanitizeNumericValue(defaultValue));
  }, [defaultValue]);

  return (
    <div className="w-full">
      <div className="flex items-center gap-1 mb-1">
        <label className="block text-xs text-gray-400">{label}</label>
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
          €
        </span>
        <input
          name={name}
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.]?[0-9]*"
          value={value}
          onChange={(event) => setValue(sanitizeNumericValue(event.target.value))}
          placeholder={placeholder}
          className="h-10 w-full border border-gray-200 rounded-lg pl-7 pr-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
        />
      </div>
    </div>
  );
}