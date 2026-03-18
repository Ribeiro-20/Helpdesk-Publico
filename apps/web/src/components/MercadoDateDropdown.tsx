"use client";

import { useEffect, useMemo, useState } from "react";

type MercadoDateDropdownProps = {
  name: string;
  defaultValue?: string;
  startYear?: number;
  endYear?: number;
};

type ParsedDate = {
  year: string;
  month: string;
  day: string;
};

function parseIsoDate(value?: string): ParsedDate {
  if (!value) return { year: "", month: "", day: "" };

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { year: "", month: "", day: "" };

  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { year: "", month: "", day: "" };

  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export default function MercadoDateDropdown({
  name,
  defaultValue = "",
  startYear,
  endYear,
}: MercadoDateDropdownProps) {
  const initialDate = useMemo(() => parseIsoDate(defaultValue), [defaultValue]);

  const [year, setYear] = useState(initialDate.year);
  const [month, setMonth] = useState(initialDate.month);
  const [day, setDay] = useState(initialDate.day);

  useEffect(() => {
    const nextDate = parseIsoDate(defaultValue);
    setYear(nextDate.year);
    setMonth(nextDate.month);
    setDay(nextDate.day);
  }, [defaultValue]);

  const currentYear = new Date().getFullYear();
  const minYear = startYear ?? 2000;
  const maxYear = endYear ?? currentYear + 1;

  const yearOptions = useMemo(() => {
    const years: string[] = [];
    for (let y = maxYear; y >= minYear; y -= 1) years.push(String(y));
    return years;
  }, [maxYear, minYear]);

  const maxDay = useMemo(() => {
    const parsedYear = parseInt(year, 10);
    const parsedMonth = parseInt(month, 10);

    if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) {
      return 31;
    }

    return daysInMonth(parsedYear, parsedMonth);
  }, [year, month]);

  useEffect(() => {
    if (!day) return;

    const parsedDay = parseInt(day, 10);
    if (!Number.isFinite(parsedDay)) {
      setDay("");
      return;
    }

    if (parsedDay > maxDay) {
      setDay(String(maxDay).padStart(2, "0"));
    }
  }, [day, maxDay]);

  const dayOptions = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, "0")),
    [maxDay],
  );

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")),
    [],
  );

  const formattedDate =
    year && month && day ? `${year}-${month}-${day}` : "";

  return (
    <div className="grid grid-cols-3 gap-2">
      <select
        value={day}
        onChange={(event) => setDay(event.target.value)}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all bg-white"
        aria-label="Dia"
      >
        <option value="">Dia</option>
        {dayOptions.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        value={month}
        onChange={(event) => setMonth(event.target.value)}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all bg-white"
        aria-label="Mes"
      >
        <option value="">Mes</option>
        {monthOptions.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        value={year}
        onChange={(event) => setYear(event.target.value)}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all bg-white"
        aria-label="Ano"
      >
        <option value="">Ano</option>
        {yearOptions.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <input type="hidden" name={name} value={formattedDate} disabled={!formattedDate} />
    </div>
  );
}
