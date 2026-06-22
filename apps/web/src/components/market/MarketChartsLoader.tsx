"use client";

import { useEffect, useState } from "react";
import MarketChartsPanel from "./MarketChartsPanel";

type MonthlyPoint = {
  month: string;
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

type ChartsResponse = {
  ok: true;
  monthlyData: MonthlyPoint[];
  procedureData: ProcedurePoint[];
  districtData: DistrictPoint[];
};

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface-50 p-4">
        <div className="h-4 w-40 rounded bg-surface-200/80" />
        <div className="mt-2 h-3 w-64 rounded bg-surface-200/60" />
        <div className="mt-4 space-y-3">
          <div className="h-8 rounded bg-white/80" />
          <div className="h-8 rounded bg-white/70" />
          <div className="h-8 rounded bg-white/60" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-surface-50 p-4">
          <div className="h-4 w-44 rounded bg-surface-200/80" />
          <div className="mt-2 h-3 w-56 rounded bg-surface-200/60" />
          <div className="mt-4 space-y-3">
            <div className="h-8 rounded bg-white/80" />
            <div className="h-8 rounded bg-white/70" />
            <div className="h-8 rounded bg-white/60" />
          </div>
        </div>
        <div className="rounded-xl bg-surface-50 p-4">
          <div className="h-4 w-44 rounded bg-surface-200/80" />
          <div className="mt-2 h-3 w-56 rounded bg-surface-200/60" />
          <div className="mt-4 space-y-3">
            <div className="h-8 rounded bg-white/80" />
            <div className="h-8 rounded bg-white/70" />
            <div className="h-8 rounded bg-white/60" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketChartsLoader() {
  const [data, setData] = useState<ChartsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCharts() {
      try {
        const response = await fetch("/api/market/charts", {
          signal: controller.signal,
          credentials: "same-origin",
        });

        const payload = (await response.json()) as ChartsResponse | { error?: string };

        if (!response.ok || !("ok" in payload) || !payload.ok) {
          throw new Error("error" in payload && payload.error ? payload.error : "Não foi possível carregar os gráficos.");
        }

        setData(payload);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar os gráficos.");
      }
    }

    void loadCharts();

    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return <LoadingSkeleton />;
  }

  return (
    <MarketChartsPanel
      monthlyData={data.monthlyData}
      procedureData={data.procedureData}
      districtData={data.districtData}
    />
  );
}