"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { format, parse, isValid } from "date-fns";
import { pt } from "date-fns/locale";
import { CalendarDays } from "lucide-react";

function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return isValid(date) ? date : undefined;
}

function dateToIso(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function isoToDisplay(iso: string): string {
  const d = isoToDate(iso);
  return d ? format(d, "dd/MM/yyyy") : "";
}

export interface SingleDatePickerProps {
  /** HTML form field name – renders a hidden input when provided */
  name?: string;
  /** ISO date (yyyy-MM-dd) for controlled mode */
  value?: string;
  /** Default ISO date for uncontrolled / form mode */
  defaultValue?: string;
  /** Called with ISO string when a date is confirmed */
  onChange?: (iso: string) => void;
  /** Placeholder shown in the trigger button */
  placeholder?: string;
  /** Minimum ISO date allowed (yyyy-MM-dd) */
  min?: string;
}

export default function SingleDatePicker({
  name,
  value: controlledValue,
  defaultValue = "",
  onChange,
  placeholder = "Seleccionar data",
  min,
}: SingleDatePickerProps) {
  const isControlled = controlledValue !== undefined;
  const [internalIso, setInternalIso] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [month, setMonth] = useState<Date>(isoToDate(controlledValue ?? defaultValue) ?? new Date());
  const ref = useRef<HTMLDivElement>(null);

  const iso = isControlled ? (controlledValue ?? "") : internalIso;

  // Sync the text input when popover opens
  useEffect(() => {
    if (open) {
      setInputText(isoToDisplay(iso));
      setMonth(isoToDate(iso) ?? new Date());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyDate(isoVal: string) {
    if (!isControlled) setInternalIso(isoVal);
    onChange?.(isoVal);
    setOpen(false);
  }

  function handleDayClick(d: Date | undefined) {
    if (!d) return;
    if (min) {
      const minDate = isoToDate(min);
      if (minDate && d < minDate) return;
    }
    setInputText(format(d, "dd/MM/yyyy"));
  }

  function handleConfirm() {
    const parsed = (() => {
      try {
        return parse(inputText, "dd/MM/yyyy", new Date());
      } catch {
        return new Date("invalid");
      }
    })();
    if (!isValid(parsed)) {
      setOpen(false);
      return;
    }

    if (min) {
      const minDate = isoToDate(min);
      if (minDate && parsed < minDate) {
        setOpen(false);
        return;
      }
    }

    applyDate(dateToIso(parsed));
  }

  // Derive DayPicker selected from the text input
  const selectedDate: Date | undefined = (() => {
    try {
      const p = parse(inputText, "dd/MM/yyyy", new Date());
      return isValid(p) ? p : undefined;
    } catch {
      return undefined;
    }
  })();

  const minDate = min ? isoToDate(min) : undefined;

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const triggerLabel = iso ? isoToDisplay(iso) : placeholder;

  return (
    <div ref={ref} className="relative inline-block">
      {/* Hidden input for native form submission */}
      {name && <input type="hidden" name={name} value={iso} />}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-card transition-all hover:border-brand-400 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-brand-700" />
        <span className={iso ? "" : "text-gray-400"}>{triggerLabel}</span>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 rounded-2xl border border-surface-200 bg-white shadow-xl"
             style={{ width: 268 }}>
          <div className="p-4 pb-0">
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={handleDayClick}
              disabled={minDate ? { before: minDate } : undefined}
              month={month}
              onMonthChange={setMonth}
              locale={pt}
              captionLayout="label"
              startMonth={new Date(2020, 0)}
              endMonth={new Date(2030, 11)}
              classNames={{
                root: "!font-sans",
                month_caption: "flex items-center justify-center py-1 mb-1",
                caption_label: "text-sm font-semibold text-gray-800 capitalize",
                nav: "flex items-center justify-between w-full absolute top-4 px-4",
                button_previous:
                  "h-7 w-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-surface-100 transition-colors",
                button_next:
                  "h-7 w-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-surface-100 transition-colors",
                weekdays: "grid grid-cols-7 mb-1",
                weekday: "text-center text-[11px] font-medium text-gray-400 py-1",
                weeks: "space-y-0.5",
                week: "grid grid-cols-7",
                day: "flex items-center justify-center",
                day_button:
                  "h-8 w-8 flex items-center justify-center rounded-full text-sm text-gray-700 transition-colors hover:bg-brand-50 hover:text-brand-700 focus:outline-none",
                selected: "[&>button]:!bg-brand-600 [&>button]:!text-white [&>button]:font-semibold",
                today: "[&>button]:font-bold [&>button]:text-brand-600",
                outside: "[&>button]:text-gray-300",
                disabled: "[&>button]:opacity-30 [&>button]:cursor-not-allowed",
              }}
            />
          </div>

          {/* Bottom: text input + confirm button */}
          <div className="flex gap-2 border-t border-surface-100 p-3">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              placeholder="dd/mm/aaaa"
              className="min-w-0 flex-1 rounded-xl border border-surface-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Definir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
