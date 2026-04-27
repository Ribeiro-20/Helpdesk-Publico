"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { CalendarDays, ChevronDown } from "lucide-react";

function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateToIso(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export interface DateRangePickerProps {
  from: string;
  to: string;
  onFromChange: (val: string) => void;
  onToChange: (val: string) => void;
}

export default function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const range: DateRange = {
    from: isoToDate(from),
    to: isoToDate(to),
  };

  function handleSelect(r: DateRange | undefined) {
    if (!r) return;
    if (r.from) onFromChange(dateToIso(r.from));
    if (r.to) {
      onToChange(dateToIso(r.to));
      setOpen(false);
    } else {
      onToChange("");
    }
  }

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const label =
    range.from && range.to
      ? `${format(range.from, "dd/MM/yyyy", { locale: pt })} — ${format(range.to, "dd/MM/yyyy", { locale: pt })}`
      : range.from
      ? `${format(range.from, "dd/MM/yyyy", { locale: pt })} — ...`
      : "Seleccionar intervalo";

  return (
    <div ref={ref} className="relative inline-block">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-card transition-all hover:border-brand-400 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-brand-700" />
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 rounded-2xl border border-surface-200 bg-white p-5 shadow-xl">
          <DayPicker
            mode="range"
            selected={range}
            onSelect={handleSelect}
            locale={pt}
            numberOfMonths={2}
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2030, 11)}
          />
          {/* Quick actions */}
          <div className="mt-3 flex items-center justify-between border-t border-surface-100 pt-3">
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                const d7 = new Date(today);
                d7.setDate(d7.getDate() - 7);
                onFromChange(dateToIso(d7));
                onToChange(dateToIso(today));
                setOpen(false);
              }}
              className="text-xs font-medium text-gray-500 hover:text-brand-600 transition-colors"
            >
              Últimos 7 dias
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                const d30 = new Date(today);
                d30.setDate(d30.getDate() - 30);
                onFromChange(dateToIso(d30));
                onToChange(dateToIso(today));
                setOpen(false);
              }}
              className="text-xs font-medium text-gray-500 hover:text-brand-600 transition-colors"
            >
              Últimos 30 dias
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                onFromChange(dateToIso(today));
                onToChange(dateToIso(today));
                setOpen(false);
              }}
              className="text-xs font-medium text-gray-500 hover:text-brand-600 transition-colors"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
