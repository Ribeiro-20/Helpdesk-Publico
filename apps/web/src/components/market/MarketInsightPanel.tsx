"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TopParty = {
  nif?: string | null;
  name?: string | null;
  count?: number | null;
  value?: number | null;
};

type Props = {
  cpvCode: string;
  cpvDescription: string | null;
  cpvDivision: string | null;
  isRealtimeFallback: boolean;
  totalContracts: number;
  contractsLast365d: number;
  totalValue: number;
  avgContractValue: number | null;
  avgDiscountPct: number | null;
  yoyGrowthPct: number | null;
  minContractValue: number | null;
  medianContractValue: number | null;
  maxContractValue: number | null;
  topEntities: TopParty[];
  topCompanies: TopParty[];
  computedAt: string | null;
};

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "--";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value));
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "--";
  return new Intl.NumberFormat("pt-PT").format(Number(value));
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "--";
  const n = Number(value);
  const prefix = n > 0 ? "+" : "";
  return `${prefix}${n.toFixed(1)}%`;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function buildConfidence(totalContracts: number, computedAt: string | null, isRealtimeFallback: boolean) {
  let score = 35;
  if (totalContracts >= 500) score = 95;
  else if (totalContracts >= 200) score = 85;
  else if (totalContracts >= 100) score = 75;
  else if (totalContracts >= 40) score = 65;
  else if (totalContracts >= 20) score = 55;

  if (computedAt) {
    const date = new Date(computedAt);
    if (!Number.isNaN(date.getTime())) {
      const days = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
      if (days > 30) score -= 20;
      else if (days > 14) score -= 12;
      else if (days > 7) score -= 6;
    }
  }

  if (isRealtimeFallback) score += 3;
  score = Math.max(10, Math.min(99, score));

  if (score >= 80) return { score, label: "Confiança alta", tone: "text-slate-700 bg-slate-100 border-slate-200" };
  if (score >= 55) return { score, label: "Confiança média", tone: "text-slate-700 bg-slate-100 border-slate-200" };
  return { score, label: "Confiança baixa", tone: "text-slate-700 bg-slate-100 border-slate-200" };
}

function CountUp({
  value,
  formatter,
  duration = 900,
  animate,
}: {
  value: number | null | undefined;
  formatter: (n: number | null | undefined) => string;
  duration?: number;
  animate: boolean;
}) {
  const [displayValue, setDisplayValue] = useState<number | null | undefined>(animate ? 0 : value);

  useEffect(() => {
    if (!animate || value == null || !Number.isFinite(Number(value))) {
      setDisplayValue(value);
      return;
    }

    const target = Number(value);
    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(p);
      setDisplayValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, duration, value]);

  return <>{formatter(displayValue)}</>;
}

function DistributionTrack({ min, median, avg, max }: { min: number | null; median: number | null; avg: number | null; max: number | null }) {
  if (min == null || max == null || min === max) {
    return (
      <div className="h-3 rounded-full bg-surface-100 border border-surface-200" />
    );
  }

  const toPct = (v: number | null) => {
    if (v == null) return null;
    return Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  };

  const points = [
    { label: "Min", value: min, color: "#0f766e" },
    { label: "Mediana", value: median, color: "#f59e0b" },
    { label: "Média", value: avg, color: "#2563eb" },
    { label: "Max", value: max, color: "#7c3aed" },
  ].map((p) => ({ ...p, pct: toPct(p.value) }));

  return (
    <div className="space-y-2">
      <div className="relative h-3 rounded-full border border-surface-200 bg-gradient-to-r from-teal-100 via-amber-100 to-violet-100">
        {points.map((p) =>
          p.pct == null ? null : (
            <span
              key={p.label}
              className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${p.pct}%`, backgroundColor: p.color }}
            />
          ),
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 md:grid-cols-4">
        {points.map((p) => (
          <div key={p.label} className="rounded-lg border border-surface-100 bg-white px-2 py-1.5">
            <span className="font-medium text-gray-500">{p.label}: </span>
            <strong className="text-gray-700">{formatCurrency(p.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankedBars({ title, rows }: { title: string; rows: TopParty[] }) {
  const normalized = useMemo(() => {
    const values = rows
      .map((r) => Number(r.value ?? 0))
      .filter((v) => Number.isFinite(v));
    const max = values.length > 0 ? Math.max(...values) : 0;

    return rows.map((r) => {
      const value = Number(r.value ?? 0);
      const pct = max > 0 ? Math.max(6, (value / max) * 100) : 0;
      return {
        key: `${r.nif ?? r.name ?? "row"}`,
        name: r.name ?? "Sem nome",
        count: Number(r.count ?? 0),
        value,
        pct,
      };
    });
  }, [rows]);

  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4">
      <p className="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">{title}</p>
      {normalized.length === 0 ? (
        <p className="text-xs text-gray-400">Sem dados disponíveis.</p>
      ) : (
        <div className="space-y-2.5">
          {normalized.map((item, idx) => (
            <div key={`${item.key}-${idx}`}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-600">
                <span className="truncate">
                  {idx + 1}. {item.name}
                </span>
                <span className="whitespace-nowrap font-medium text-gray-700">{formatCurrency(item.value)}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-100">
                <div
                  className="h-2 rounded-full bg-brand-500 transition-all duration-700"
                  style={{ width: `${item.pct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-gray-400">{formatNumber(item.count)} contratos</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MarketInsightPanel(props: Props) {
  const {
    cpvCode,
    cpvDescription,
    cpvDivision,
    isRealtimeFallback,
    totalContracts,
    contractsLast365d,
    totalValue,
    avgContractValue,
    avgDiscountPct,
    yoyGrowthPct,
    minContractValue,
    medianContractValue,
    maxContractValue,
    topEntities,
    topCompanies,
    computedAt,
  } = props;

  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stats = [
    { label: "Contratos (12m)", value: contractsLast365d, type: "number" as const },
    { label: "Valor total", value: totalValue, type: "currency" as const },
    { label: "Valor médio", value: avgContractValue, type: "currency" as const },
    { label: "Desconto médio", value: avgDiscountPct, type: "percent" as const },
    { label: "Crescimento YoY", value: yoyGrowthPct, type: "percent" as const },
  ];

  const formatterByType = {
    number: formatNumber,
    currency: formatCurrency,
    percent: formatPercent,
  };
  const confidence = buildConfidence(totalContracts, computedAt, isRealtimeFallback);

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-surface-200 bg-white p-5"
    >
      <div className="mb-5">
        <p className="text-3xl font-extrabold tracking-tight text-slate-900">
          {cpvCode} <span className="text-lg font-semibold text-slate-700">-- {cpvDescription ?? "Sem descrição"}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-slate-500">
            Divisão {cpvDivision ?? "--"} &middot; {isRealtimeFallback ? "cálculo em tempo real a partir de contratos" : "dados da tabela cpv_stats"}
          </p>
          <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${confidence.tone}`}>
            {confidence.label}: {confidence.score}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat, idx) => (
          <div
            key={stat.label}
            className="rounded-xl border border-surface-200 bg-white p-3 transition-all duration-500"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0px)" : "translateY(10px)",
              transitionDelay: `${idx * 80}ms`,
            }}
          >
            <p className="text-[10px] uppercase tracking-widest text-slate-400">{stat.label}</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">
              <CountUp
                value={stat.value}
                formatter={formatterByType[stat.type]}
                animate={visible}
              />
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <RankedBars title="Top Entidades (quem mais compra)" rows={topEntities} />
        <RankedBars title="Top Empresas (quem mais ganha)" rows={topCompanies} />
      </div>

      <div className="mt-3 rounded-xl border border-surface-200 bg-white p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">Distribuição de valores</p>
        <DistributionTrack
          min={minContractValue}
          median={medianContractValue}
          avg={avgContractValue}
          max={maxContractValue}
        />
      </div>
    </div>
  );
}
