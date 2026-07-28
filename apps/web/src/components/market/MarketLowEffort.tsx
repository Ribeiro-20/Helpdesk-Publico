function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("pt-PT").format(value);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-100">
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export type ProcedureDistItem = { label: string; count: number; total_value: number };

export function ProcedurePercentTable({ data }: { data: ProcedureDistItem[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (data.length === 0) return null;
  return (
    <Section title="% de contratos por procedimento">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400 border-b border-surface-100">
              <th className="px-4 py-2 text-left">Procedimento</th>
              <th className="px-4 py-2 text-right">Contratos</th>
              <th className="px-4 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const pct = total > 0 ? (row.count / total) * 100 : 0;
              return (
                <tr key={i} className="border-b border-surface-50 hover:bg-surface-50">
                  <td className="px-4 py-2 text-gray-900 max-w-[280px]">
                    <span className="block truncate" title={row.label}>{row.label}</span>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-700">{formatCount(row.count)}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="font-medium text-brand-600">{pct.toFixed(1)}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export type MonthlyCountItem = { month: string; unique_operators?: number; unique_entities?: number };

export function MonthlyOperatorsTable({ data }: { data: MonthlyCountItem[] }) {
  if (data.length === 0) return null;
  return (
    <Section title="Evolução mensal — Operadores económicos">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400 border-b border-surface-100">
              <th className="px-4 py-2 text-left">Mês</th>
              <th className="px-4 py-2 text-right">Operadores únicos</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-surface-50 hover:bg-surface-50">
                <td className="px-4 py-2 text-gray-900">{row.month}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-700">
                  {formatCount(row.unique_operators ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function MonthlyEntitiesTable({ data }: { data: MonthlyCountItem[] }) {
  if (data.length === 0) return null;
  return (
    <Section title="Evolução mensal — Entidades adjudicantes">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400 border-b border-surface-100">
              <th className="px-4 py-2 text-left">Mês</th>
              <th className="px-4 py-2 text-right">Entidades únicas</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-surface-50 hover:bg-surface-50">
                <td className="px-4 py-2 text-gray-900">{row.month}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-700">
                  {formatCount(row.unique_entities ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export type CpvValueItem = { cpv: string; count: number; total_value: number };

export function TopCpvByValueTable({ data }: { data: CpvValueItem[] }) {
  if (data.length === 0) return null;
  return (
    <Section title="Top 10 CPV por valor contratado">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400 border-b border-surface-100">
              <th className="px-4 py-2 text-left w-6">#</th>
              <th className="px-4 py-2 text-left">CPV</th>
              <th className="px-4 py-2 text-right">Contratos</th>
              <th className="px-4 py-2 text-right">Valor total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-surface-50 hover:bg-surface-50">
                <td className="px-4 py-2 text-gray-400 font-medium">{i + 1}</td>
                <td className="px-4 py-2 text-gray-900">{row.cpv}</td>
                <td className="px-4 py-2 text-right text-gray-700">{formatCount(row.count)}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-900">{formatCurrency(row.total_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function TopProcedureByValueTable({ data, grandTotal }: { data: ProcedureDistItem[]; grandTotal?: number }) {
  if (data.length === 0) return null;
  const total = grandTotal ?? data.reduce((s, d) => s + d.total_value, 0);
  return (
    <Section title="Top 10 procedimentos por valor contratado">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase text-gray-400 border-b border-surface-100">
            <th className="px-4 py-2 text-left">#</th>
            <th className="px-4 py-2 text-left w-full">Procedimento</th>
            <th className="px-4 py-2 text-right whitespace-nowrap">Contratos</th>
            <th className="px-4 py-2 text-right whitespace-nowrap">Valor total</th>
            <th className="px-4 py-2 text-right whitespace-nowrap">%</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const pct = total > 0 ? (row.total_value / total) * 100 : 0;
            return (
              <tr key={i} className="border-b border-surface-50 hover:bg-surface-50">
                <td className="px-4 py-2 text-gray-400 font-medium">{i + 1}</td>
                <td className="px-4 py-2 text-gray-900 max-w-0 w-full overflow-hidden">
                  <span className="block truncate" title={row.label}>{row.label}</span>
                </td>
                <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">{formatCount(row.count)}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-900 whitespace-nowrap">{formatCurrency(row.total_value)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap"><span className="font-medium text-brand-600">{pct.toFixed(1)}%</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

export type DistrictItem = { district: string; count: number; total_value: number };

export function TopDistrictTable({ data }: { data: DistrictItem[] }) {
  if (data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.total_value, 0);
  return (
    <Section title="Top 10 distritos por valor contratado">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400 border-b border-surface-100">
              <th className="px-4 py-2 text-left w-6">#</th>
              <th className="px-4 py-2 text-left">Distrito</th>
              <th className="px-4 py-2 text-right">Contratos</th>
              <th className="px-4 py-2 text-right">Valor total</th>
              <th className="px-4 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const pct = total > 0 ? (row.total_value / total) * 100 : 0;
              return (
                <tr key={i} className="border-b border-surface-50 hover:bg-surface-50">
                  <td className="px-4 py-2 text-gray-400 font-medium">{i + 1}</td>
                  <td className="px-4 py-2 text-gray-900">{row.district}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{formatCount(row.count)}</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">{formatCurrency(row.total_value)}</td>
                  <td className="px-4 py-2 text-right"><span className="font-medium text-brand-600">{pct.toFixed(1)}%</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
