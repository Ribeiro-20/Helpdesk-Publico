type OverviewItem = {
  code: string;
  description: string | null;
  contracts: number;
  totalValue: number;
  avgContractValue: number;
  avgDiscountPct: number | null;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-PT").format(value);
}

function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

const chartPalette = ["#2563eb", "#0891b2", "#0f766e", "#f59e0b", "#dc2626", "#6b7280"];
const BAR_AREA_WIDTH_CLASS = "w-[430px] max-w-full";
const ROW_CONTENT_WIDTH_CLASS = "w-[560px] max-w-full";

function formatCompactPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function BarBlock({
  title,
  subtitle,
  rows,
  valueOf,
  valueLabel,
}: {
  title: string;
  subtitle: string;
  rows: OverviewItem[];
  valueOf: (item: OverviewItem) => number;
  valueLabel: (item: OverviewItem) => string;
}) {
  const top = rows.slice(0, 5);
  const restValue = rows.slice(5).reduce((sum, item) => sum + Math.max(0, valueOf(item)), 0);
  const merged = restValue > 0
    ? [...top, { code: "Outros", description: "Restantes CPVs", contracts: 0, totalValue: restValue, avgContractValue: restValue, avgDiscountPct: null }]
    : top;

  const total = merged.reduce((sum, item) => sum + Math.max(0, valueOf(item)), 0);

  return (
    <div className="rounded-xl bg-surface-50 p-4">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-xs text-gray-500">{subtitle}</p>

      <div className="mt-4 space-y-2.5 min-w-0">
        {merged.length === 0 ? (
          <p className="text-xs text-gray-500">Sem dados disponíveis.</p>
        ) : (
          merged.map((item, idx) => {
            const metric = Math.max(0, valueOf(item));
            const sharePct = total > 0 ? (metric / total) * 100 : 0;
            const color = chartPalette[idx % chartPalette.length];

            return (
              <div key={`${title}-${item.code}-${idx}`} className="rounded-lg bg-white px-3 py-2.5">
                <div className={ROW_CONTENT_WIDTH_CLASS}>
                  <div className="flex items-start justify-between gap-3">
                    <div className={`${BAR_AREA_WIDTH_CLASS} min-w-0`}>
                      <p className="truncate text-xs font-semibold text-gray-700">{item.code}</p>
                      <p className="truncate text-[11px] text-gray-500">{item.description ?? "Sem descrição"}</p>

                      <div className="mt-2 h-2 rounded-full bg-surface-100">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(6, sharePct)}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-gray-700">{valueLabel(item)}</p>
                      <p className="text-[11px] text-gray-500">{formatCompactPercent(sharePct)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function MarketOverviewPanel({
  totalContracts,
  totalValue,
  activeCpvs,
  avgDiscountPct,
  items,
}: {
  totalContracts: number;
  totalValue: number;
  activeCpvs: number;
  avgDiscountPct: number | null;
  items: OverviewItem[];
}) {
  const byContracts = [...items].sort((a, b) => (b.contracts - a.contracts) || (b.totalValue - a.totalValue)).slice(0, 6);
  const byValue = [...items].sort((a, b) => (b.totalValue - a.totalValue) || (b.contracts - a.contracts)).slice(0, 6);
  const byTicket = [...items].sort((a, b) => (b.avgContractValue - a.avgContractValue) || (b.totalValue - a.totalValue)).slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-surface-200 bg-white/90 p-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-widest text-slate-400">Total de contratos</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{formatNumber(totalContracts)}</p>
        </div>
        <div className="rounded-xl border border-surface-200 bg-white/90 p-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-widest text-slate-400">Valor total mercado</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{formatCurrency(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-surface-200 bg-white/90 p-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-widest text-slate-400">CPVs ativos</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{formatNumber(activeCpvs)}</p>
        </div>
        <div className="rounded-xl border border-surface-200 bg-white/90 p-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-widest text-slate-400">Desconto médio</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{formatPercent(avgDiscountPct)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarBlock
          title="CPVs por número de contratos"
          subtitle="Comparação direta de volume adjudicado"
          rows={byContracts}
          valueOf={(item) => item.contracts}
          valueLabel={(item) => formatNumber(item.contracts)}
        />

        <BarBlock
          title="CPVs por valor total"
          subtitle="Setores que movimentam mais verba"
          rows={byValue}
          valueOf={(item) => item.totalValue}
          valueLabel={(item) => formatCurrency(item.totalValue)}
        />
      </div>

      <BarBlock
        title="CPVs por ticket médio"
        subtitle="Comparação de valor médio por contrato"
        rows={byTicket}
        valueOf={(item) => item.avgContractValue}
        valueLabel={(item) => formatCurrency(item.avgContractValue)}
      />
    </div>
  );
}
