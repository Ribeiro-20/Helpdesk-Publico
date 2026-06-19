"use client";

import { useEffect, useMemo, useState } from "react";
import MercadoSingleSelect from "@/components/MercadoSingleSelect";

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

  const minYear = startYear ?? 2021;
  const maxYear = endYear ?? 2026;

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
      <MercadoSingleSelect
        name={`${name}_day_ui`}
        hideLabel
        showHiddenInput={false}
        optionDensity="compact"
        label="Dia"
        value={day}
        defaultValue={day}
        onChange={setDay}
        options={[{ value: "", label: "Dia" }, ...dayOptions.map((value) => ({ value, label: value }))]}
      />

      <MercadoSingleSelect
        name={`${name}_month_ui`}
        hideLabel
        showHiddenInput={false}
        label="Mês"
        value={month}
        defaultValue={month}
        onChange={setMonth}
        options={[{ value: "", label: "Mês" }, ...monthOptions.map((value) => ({ value, label: value }))]}
      />

      <MercadoSingleSelect
        name={`${name}_year_ui`}
        hideLabel
        showHiddenInput={false}
        label="Ano"
        value={year}
        defaultValue={year}
        onChange={setYear}
        options={[{ value: "", label: "Ano" }, ...yearOptions.map((value) => ({ value, label: value }))]}
      />

      <input type="hidden" name={name} value={formattedDate} disabled={!formattedDate} />
    </div>
  );
}
