"use client";

import SingleDatePicker from "@/components/SingleDatePicker";

type MercadoDateDropdownProps = {
  name: string;
  defaultValue?: string;
  startYear?: number;
  endYear?: number;
};

function normalizeIsoDate(value?: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return value;
}

export default function MercadoDateDropdown({
  name,
  defaultValue = "",
  startYear = 2021,
}: MercadoDateDropdownProps) {
  return (
    <SingleDatePicker
      name={name}
      defaultValue={normalizeIsoDate(defaultValue)}
      placeholder="Selecionar data"
      min={`${startYear}-01-01`}
      className="w-full"
      buttonClassName="h-10 w-full justify-start"
    />
  );
}
