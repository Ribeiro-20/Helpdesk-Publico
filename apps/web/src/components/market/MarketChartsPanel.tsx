type MonthlyPoint = {
  month: string; // "YYYY-MM"
  contracts: number;
  value: number;
};

type ProcedurePoint = {
  type: string;
  contracts: number;
  value: number;
};

type DistrictPoint = {
  district: string;
  contracts: number;
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

function formatMonth(m: string): string {
  const [year, month] = m.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[parseInt(month) - 1]} ${year}`;
}

function HBar({
  pct,
  color,
}: {
  pct: number;
  color: "brand" | "teal" | "amber";
}) {
  const bg =
    color === "brand"
      ? "bg-brand-500"
      : color === "teal"
      ? "bg-teal-500"
      : "bg-amber-500";
  return (
    <div className="mt-1 h-1.5 w-full rounded-full bg-surface-100">
      <div className={`h-full rounded-full ${bg}`} style={{ width: `${Math.max(3, pct)}%` }} />
    </div>
  );
}

export default function MarketChartsPanel({
  monthlyData,
  procedureData,
  districtData,
}: {
  monthlyData: MonthlyPoint[];
  procedureData: ProcedurePoint[];
  districtData: DistrictPoint[];
}) {
  const hasMonthly = monthlyData.length > 0;
  const hasProcedure = procedureData.length > 0;
  const hasDistrict = districtData.length > 0;

  if (!hasMonthly && !hasProcedure && !hasDistrict) return null;

  const maxMonthValue = hasMonthly ? Math.max(...monthlyData.map((p) => p.value)) : 0;
  const maxProcedure = hasProcedure ? Math.max(...procedureData.map((p) => p.contracts)) : 0;
  const maxDistrict = hasDistrict ? Math.max(...districtData.map((p) => p.contracts)) : 0;

  return (
    <div className="space-y-4">
      {/* Evolução mensal — full width */}
      {hasMonthly && (
        <div className="rounded-xl bg-surface-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Evolução mensal</h3>
          <p className="mt-0.5 text-xs text-gray-500">Valor total contratado por mês</p>
          <div className="mt-4 space-y-2.5">
            {monthlyData.map((point) => (
              <div key={point.month} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-right text-[11px] text-gray-500">
                  {formatMonth(point.month)}
                </span>
                <div className="flex-1 rounded-full bg-surface-100 h-2">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.max(3, maxMonthValue > 0 ? (point.value / maxMonthValue) * 100 : 0)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-[11px] font-medium text-gray-700">
                  {formatCurrency(point.value)}
                </span>
                <span className="w-12 shrink-0 text-right text-[11px] text-gray-400">
                  {formatNumber(point.contracts)} ct.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Procedimento + Distrito — 2 cols */}
      {(hasProcedure || hasDistrict) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {hasProcedure && (
            <div className="rounded-xl bg-surface-50 p-4">
              <h3 className="text-sm font-semibold text-gray-900">Tipo de procedimento</h3>
              <p className="mt-0.5 text-xs text-gray-500">Por número de contratos adjudicados</p>
              <div className="mt-3 space-y-2.5">
                {procedureData.slice(0, 7).map((point) => (
                  <div key={point.type}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11px] text-gray-600 max-w-[180px]">{point.type}</span>
                      <span className="shrink-0 text-[11px] font-medium text-gray-700">
                        {formatNumber(point.contracts)}
                      </span>
                    </div>
                    <HBar pct={maxProcedure > 0 ? (point.contracts / maxProcedure) * 100 : 0} color="teal" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasDistrict && (
            <div className="rounded-xl bg-surface-50 p-4">
              <h3 className="text-sm font-semibold text-gray-900">Distribuição geográfica</h3>
              <p className="mt-0.5 text-xs text-gray-500">Distritos com mais contratos</p>
              <div className="mt-3 space-y-2.5">
                {districtData.slice(0, 7).map((point) => (
                  <div key={point.district}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11px] text-gray-600 max-w-[180px]">{point.district}</span>
                      <span className="shrink-0 text-[11px] font-medium text-gray-700">
                        {formatNumber(point.contracts)}
                      </span>
                    </div>
                    <HBar pct={maxDistrict > 0 ? (point.contracts / maxDistrict) * 100 : 0} color="amber" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
