"use client";

import { useState, useRef, useEffect } from "react";
import SingleDatePicker from "../SingleDatePicker";
import CpvMultiSearchInput from "../CpvMultiSearchInput";
import BaseHistoricalIngestButton from "./BaseHistoricalIngestButton";

const ACT_TYPE_OPTIONS = [
  "Anúncio de procedimento",
  "Anúncio de concurso urgente",
  "Declaração de retificação de anúncio",
  "Aviso de prorrogação de prazo",
  "Anúncio de Alteração",
] as const;

const CONTRACT_TYPE_OPTIONS = [
  "Aquisição de bens móveis",
  "Aquisição de serviços",
  "Concessão de obras públicas",
  "Concessão de serviços públicos",
  "Empreitadas de obras públicas",
  "Locação de bens móveis",
  "Sociedade",
  "Outros",
] as const;

const MODEL_TYPE_OPTIONS = [
  "Concurso público",
  "Concurso público urgente",
  "Concurso limitado por prévia qualificação",
  "Procedimento de negociação",
  "Diálogo concorrencial",
  "Concurso de conceção",
  "Anúncio simplificado",
  "Instituição de sistema de qualificação",
  "Parceria para a inovação",
  "Concurso de ideias",
  "Instituição de sistema de aquisição dinâmico",
  "Hasta Pública de Alienação de Bens Móveis",
  "Aquisição de Serviços Sociais e de Outros Serviços Específicos",
  "Anúncio de Adjudicação de Aquisição de Serviços Sociais e de Outros Serviços Específicos",
  "Concurso público simplificado",
  "Concurso limitado por prévia qualificação simplificado",
] as const;

const DISTRICT_OPTIONS = [
  "Aveiro",
  "Beja",
  "Braga",
  "Bragança",
  "Castelo Branco",
  "Coimbra",
  "Évora",
  "Faro",
  "Guarda",
  "Leiria",
  "Lisboa",
  "Portalegre",
  "Porto",
  "Região Autónoma da Madeira",
  "Região Autónoma dos Açores",
  "Santarém",
  "Setúbal",
  "Viana do Castelo",
  "Vila Real",
  "Viseu",
] as const;

function MultiCheckbox({
  label,
  name,
  options,
  defaultValues,
}: {
  label: string;
  name: string;
  options: readonly string[];
  defaultValues: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultValues));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (option: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  };

  const selectedArr = Array.from(selected);
  const buttonLabel =
    selected.size === 0
      ? "Todos"
      : selected.size === 1
      ? [...selected][0]
      : `${selected.size} selecionados`;

  return (
    <div ref={ref} className="relative">
      <span className="mb-1 block text-xs text-gray-400">{label}</span>
      <input type="hidden" name={name} value={selectedArr.join(",")} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-card transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 flex items-center justify-between text-left"
      >
        <span className="truncate">{buttonLabel}</span>
        <svg
          className={`ml-2 h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-max rounded-xl border border-surface-200 bg-white shadow-lg max-h-72 overflow-y-auto">
          <div className="p-2">
            <div className="flex gap-3 mb-1 px-2 py-1 border-b border-surface-100">
              <button
                type="button"
                onClick={() => setSelected(new Set(options))}
                className="text-xs text-brand-600 hover:underline"
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-400 hover:underline"
              >
                Limpar
              </button>
            </div>
            {options.map((option) => (
              <label
                key={option}
                className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-50 cursor-pointer text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={selected.has(option)}
                  onChange={() => toggle(option)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-brand-600"
                />
                <span className="leading-tight">{option}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type Props = {
  analysisType: "announcements" | "contracts";
  defaultActTypes: string[];
  defaultContractTypes: string[];
  defaultModelTypes: string[];
  defaultDistricts: string[];
  defaultDateFrom: string;
  defaultDateTo: string;
  defaultCpv: string;
  defaultSort: string;
  observatoryHref: string;
};

export default function MarketFiltersForm({
  analysisType,
  defaultActTypes,
  defaultContractTypes,
  defaultModelTypes,
  defaultDistricts,
  defaultDateFrom,
  defaultDateTo,
  defaultCpv,
  defaultSort,
  observatoryHref,
}: Props) {
  return (
    <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-card">
      <h2 className="font-semibold text-gray-900 mb-4">Filtros de mercado</h2>
      <form className="space-y-4">
        <input type="hidden" name="analysis" value={analysisType} />
        <input type="hidden" name="apply" value="1" />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {analysisType === "announcements" ? (
            <>
              <MultiCheckbox
                label="Tipo de ato"
                name="act_type"
                options={ACT_TYPE_OPTIONS}
                defaultValues={defaultActTypes}
              />
              <MultiCheckbox
                label="Tipo de contrato"
                name="contract_type"
                options={CONTRACT_TYPE_OPTIONS}
                defaultValues={defaultContractTypes}
              />
              <MultiCheckbox
                label="Tipo de modelo"
                name="model_type"
                options={MODEL_TYPE_OPTIONS}
                defaultValues={defaultModelTypes}
              />
            </>
          ) : (
            <>
              <MultiCheckbox
                label="Tipo de contrato"
                name="contract_type"
                options={CONTRACT_TYPE_OPTIONS}
                defaultValues={defaultContractTypes}
              />
              <MultiCheckbox
                label="Tipo de modelo"
                name="model_type"
                options={MODEL_TYPE_OPTIONS}
                defaultValues={defaultModelTypes}
              />
              <MultiCheckbox
                label="Distrito"
                name="district"
                options={DISTRICT_OPTIONS}
                defaultValues={defaultDistricts}
              />
            </>
          )}

          <div className="block">
            <span className="mb-1 block text-xs text-gray-400">Data inicial</span>
            <SingleDatePicker
              name="date_from"
              defaultValue={defaultDateFrom}
              placeholder="Selecionar data"
              className="w-full"
              buttonClassName="w-full justify-start"
            />
          </div>

          <div className="block">
            <span className="mb-1 block text-xs text-gray-400">Data final</span>
            <SingleDatePicker
              name="date_to"
              defaultValue={defaultDateTo}
              min={defaultDateFrom || undefined}
              placeholder="Selecionar data"
              className="w-full"
              buttonClassName="w-full justify-start"
            />
          </div>

          <div>
            <CpvMultiSearchInput
              name="cpv"
              defaultValue={defaultCpv}
              label="CPV"
              placeholder="Ex: 71240000-2"
              compact
            />
          </div>

          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block text-xs text-gray-400">Ordenação</span>
            <select
              name="sort"
              defaultValue={defaultSort}
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-card transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="relevance">Mais relevantes</option>
              <option value="detail_desc">Maior pormenor</option>
              <option value="recent">Mais recentes</option>
              <option value="value_desc">Maior valor</option>
              <option value="value_asc">Menor valor</option>
            </select>
          </label>
        </div>

        <div>
          <button
            type="submit"
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md"
          >
            Filtrar
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={observatoryHref}
            className="rounded-xl border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-card transition-all hover:bg-surface-50"
          >
            Abrir observatório com estes filtros
          </a>
          <BaseHistoricalIngestButton />
        </div>
      </form>
    </div>
  );
}
