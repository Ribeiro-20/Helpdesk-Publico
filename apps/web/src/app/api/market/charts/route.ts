import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type ContractForCharts = {
  signing_date: string | null;
  contract_price: number | null;
  execution_locations: unknown;
  procedure_type: string | null;
};

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

async function fetchAllContractsForTenant<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  columns: string,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data } = await supabase
      .from("contracts")
      .select(columns)
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);

    const chunk = (data ?? []) as T[];
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  return rows;
}

function aggregateCharts(rows: ContractForCharts[]): {
  monthlyData: MonthlyPoint[];
  procedureData: ProcedurePoint[];
  districtData: DistrictPoint[];
} {
  const monthlyMap = new Map<string, { contracts: number; value: number }>();
  const procedureMap = new Map<string, { contracts: number; value: number }>();
  const districtMap = new Map<string, number>();

  for (const row of rows) {
    const value = row.contract_price != null && Number.isFinite(Number(row.contract_price)) ? Number(row.contract_price) : 0;

    if (row.signing_date) {
      const month = row.signing_date.slice(0, 7);
      const current = monthlyMap.get(month) ?? { contracts: 0, value: 0 };
      current.contracts += 1;
      current.value += value;
      monthlyMap.set(month, current);
    }

    const proc = row.procedure_type?.trim() || "Desconhecido";
    const currentProc = procedureMap.get(proc) ?? { contracts: 0, value: 0 };
    currentProc.contracts += 1;
    currentProc.value += value;
    procedureMap.set(proc, currentProc);

    const locs = Array.isArray(row.execution_locations) ? (row.execution_locations as string[]) : [];
    const seenDistricts = new Set<string>();
    for (const loc of locs) {
      if (typeof loc !== "string") continue;
      const parts = loc.split(", ");
      if (parts.length < 2) continue;
      const district = parts[1].trim();
      if (!district || seenDistricts.has(district)) continue;
      seenDistricts.add(district);
      districtMap.set(district, (districtMap.get(district) ?? 0) + 1);
    }
  }

  return {
    monthlyData: Array.from(monthlyMap.entries())
      .map(([month, agg]) => ({ month, ...agg }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    procedureData: Array.from(procedureMap.entries())
      .map(([type, agg]) => ({ type, ...agg }))
      .sort((a, b) => b.contracts - a.contracts),
    districtData: Array.from(districtMap.entries())
      .map(([district, contracts]) => ({ district, contracts }))
      .sort((a, b) => b.contracts - a.contracts),
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: appUser, error: appUserError } = await supabase
      .from("app_users")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (appUserError) {
      return NextResponse.json({ error: appUserError.message }, { status: 500 });
    }

    if (!appUser?.tenant_id) {
      return NextResponse.json({ ok: true, monthlyData: [], procedureData: [], districtData: [] });
    }

    const rows = await fetchAllContractsForTenant<ContractForCharts>(
      supabase,
      appUser.tenant_id,
      "signing_date, contract_price, execution_locations, procedure_type",
    );

    const data = aggregateCharts(rows);

    return NextResponse.json({ ok: true, ...data }, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}