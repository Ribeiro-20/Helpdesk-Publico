"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CpvHintItem = {
  code: string;
  description: string | null;
  contracts: number;
  totalValue: number;
};

type Props = {
  items: CpvHintItem[];
};

function chunkItems<T>(arr: T[], chunkSize: number): T[][] {
  if (arr.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("pt-PT").format(n);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CpvCarouselHints({ items }: Props) {
  const fallback: CpvHintItem[] = [
    { code: "77000000-0", description: "Serviços de agricultura, silvicultura e horticultura", contracts: 0, totalValue: 0 },
    { code: "71240000-2", description: "Serviços de arquitectura, engenharia e planeamento", contracts: 0, totalValue: 0 },
    { code: "09133000-0", description: "Gás de petróleo liquefeito (GPL)", contracts: 0, totalValue: 0 },
    { code: "33600000-6", description: "Produtos farmacêuticos", contracts: 0, totalValue: 0 },
    { code: "09310000-5", description: "Electricidade", contracts: 0, totalValue: 0 },
    { code: "45233141-9", description: "Trabalhos de manutenção rodoviária", contracts: 0, totalValue: 0 },
  ];

  const source = items.length > 0 ? items : fallback;
  const pages = useMemo(() => chunkItems(source, 3), [source]);
  const [activePage, setActivePage] = useState(0);

  useEffect(() => {
    if (pages.length <= 1) return;
    const id = setInterval(() => {
      setActivePage((prev) => (prev + 1) % pages.length);
    }, 4000);
    return () => clearInterval(id);
  }, [pages.length]);

  return (
    <div className="rounded-2xl border border-surface-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-700">Sugestões de CPV para explorar</p>
      </div>

      <div className="relative min-h-[210px] overflow-hidden rounded-xl border border-surface-100 bg-white/80 p-3">
        {pages.map((page, pageIndex) => (
          <div
            key={`page-${pageIndex}`}
            className="absolute inset-0 grid gap-3 p-3 md:grid-cols-3"
            style={{
              opacity: activePage === pageIndex ? 1 : 0,
              transform: activePage === pageIndex ? "translateX(0%)" : "translateX(6%)",
              pointerEvents: activePage === pageIndex ? "auto" : "none",
              transition: "opacity 420ms ease, transform 420ms ease",
            }}
          >
            {page.map((item, idx) => (
              <Link
                key={`${item.code}-${idx}`}
                href={`/market?cpv=${encodeURIComponent(item.code)}`}
                className="group flex h-full flex-col rounded-xl border border-surface-200 bg-white p-3 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
              >
                <p className="text-base font-bold text-gray-900 group-hover:text-brand-700">{item.code}</p>
                <p className="mt-1 line-clamp-2 min-h-[32px] text-xs text-gray-500">
                  {item.description ?? "Sem descrição disponível"}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-2 py-1 min-h-[44px] flex flex-col items-center justify-center text-center">
                    <p className="text-[10px] uppercase tracking-wide text-amber-600/90">Valor total</p>
                    <p className="text-[11px] font-semibold text-amber-700">
                      {item.totalValue > 0 ? formatCurrency(item.totalValue) : "--"}
                    </p>
                  </div>
                  <div className="rounded-md border border-brand-100 bg-brand-50 px-2 py-1 min-h-[44px] flex flex-col items-center justify-center text-center">
                    <p className="text-[10px] uppercase tracking-wide text-brand-600/90">Contratos</p>
                    <p className="text-[11px] font-semibold text-brand-700">
                      {item.contracts > 0 ? formatCount(item.contracts) : "--"}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Clique para analisar</span>
                  <span className="text-gray-400">&rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>

      {pages.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {pages.map((_, i) => (
            <button
              key={`dot-${i}`}
              type="button"
              aria-label={`Ir para página ${i + 1}`}
              onClick={() => setActivePage(i)}
              className={`h-1.5 rounded-full transition-all ${activePage === i ? "w-5 bg-brand-600" : "w-2 bg-surface-300 hover:bg-surface-400"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
