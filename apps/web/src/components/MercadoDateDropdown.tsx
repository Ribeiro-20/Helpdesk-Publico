"use client";

import { useEffect, useMemo, useState } from "react";

type MercadoDateDropdownProps = {
  name: string;
  defaultValue?: string;
};

const MONTHS: Array<{ value: string; label: string }> = [
  { value: "1", label: "Jan" },
  { value: "2", label: "Fev" },
  { value: "3", label: "Mar" },
  { value: "4", label: "Abr" },
  { value: "5", label: "Mai" },
  { value: "6", label: "Jun" },
  { value: "7", label: "Jul" },
  { value: "8", label: "Ago" },
  { value: "9", label: "Set" },
  { value: "10", label: "Out" },
  { value: "11", label: "Nov" },
  { value: "12", label: "Dez" },
];

function toNumber(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseDateParts(value: string | undefined): {
  year: string;
  month: string;
  day: string;
} {
  if (!value) return { year: "", month: "", day: "" };

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { year: "", month: "", day: "" };

  const [, year, month, day] = match;
  return {
    year,
    month: String(Number(month)),
    day: String(Number(day)),
  };
}

export default function MercadoDateDropdown({
  name,
  defaultValue = "",
}: MercadoDateDropdownProps) {
  const parts = useMemo(() => parseDateParts(defaultValue), [defaultValue]);

  const [day, setDay] = useState(parts.day);
  const [month, setMonth] = useState(parts.month);
  const [year, setYear] = useState(parts.year);

  useEffect(() => {
    setDay(parts.day);
    setMonth(parts.month);
    setYear(parts.year);
  }, [parts.day, parts.month, parts.year]);

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years: string[] = [];
    for (let y = currentYear + 1; y >= 1990; y -= 1) {
      years.push(String(y));
    }
    return years;
  }, [currentYear]);

  const maxDay = useMemo(() => {
    const y = toNumber(year);
    const m = toNumber(month);
    if (!y || !m) return 31;
    return daysInMonth(y, m);
  }, [year, month]);

  const dayOptions = useMemo(() => {
    const out: string[] = [];
    for (let d = 1; d <= maxDay; d += 1) out.push(String(d));
    return out;
  }, [maxDay]);

  useEffect(() => {
    if (!day) return;
    const dayNum = Number(day);
    if (dayNum > maxDay) setDay("");
  }, [day, maxDay]);

  const hiddenValue = useMemo(() => {
    if (!day || !month || !year) return "";

    const d = String(Number(day)).padStart(2, "0");
    const m = String(Number(month)).padStart(2, "0");
    const y = String(Number(year));

    return `${y}-${m}-${d}`;
  }, [day, month, year]);

  const selectClassName =
    "border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all bg-white w-full";

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <select
          value={day}
          onChange={(event) => setDay(event.target.value)}
          className={selectClassName}
        >
          <option value="">Dia</option>
          {dayOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className={selectClassName}
        >
          <option value="">Mes</option>
          {MONTHS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(event) => setYear(event.target.value)}
          className={selectClassName}
        >
          <option value="">Ano</option>
          {yearOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <input type="hidden" name={name} value={hiddenValue} />
    </>
  );
}
