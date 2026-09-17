import {
  buildSemicolonCsv,
  PRIVATE_NO_STORE_HEADERS,
} from "@/lib/export-csv";
import { requireBackofficeUser } from "@/lib/server/backoffice-export-auth";
import { consumeBackofficeExportRateLimit } from "@/lib/server/backoffice-export-rate-limit";
import { createAdminClient } from "@/lib/supabase/server";
import { classifyContractExport, parseContractExportEnvelope } from "@/lib/contract-export";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_EXPORT_ROWS = 5000;
const RPC_PAGE_SIZE = MAX_EXPORT_ROWS + 1;

type ContractRow = {
  id: string;
  base_contract_id?: string | null;
  object: string | null;
  procedure_type: string | null;
  publication_date: string | null;
  signing_date: string | null;
  cpv_main: string | null;
  contract_price: number | null;
  base_price: number | null;
  effective_price: number | null;
  currency: string | null;
  status: string | null;
  contracting_entities: unknown;
  winners: unknown;
};

function parseNumber(value: string | null): number | null {
  if (!value?.trim()) return null;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function partyLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  const name = String(row.name ?? row.nome ?? row.label ?? row.value ?? "").trim();
  const nif = String(row.nif ?? row.NIF ?? "").trim();
  if (name && nif && !name.includes(nif)) return `${name} (${nif})`;
  return name || nif;
}

function parties(value: unknown): string {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map(partyLabel).filter(Boolean).join("; ");
}

function errorResponse(error: string, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(
    { error },
    { status, headers: { ...PRIVATE_NO_STORE_HEADERS, ...headers } },
  );
}

async function exportContracts(req: NextRequest) {
  const auth = await requireBackofficeUser();
  if (!auth.ok) {
    return errorResponse(auth.error, auth.status);
  }

  const rateLimit = await consumeBackofficeExportRateLimit(auth.supabase);
  if (!rateLimit.ok) {
    console.error("Contract export rate-limit check failed", rateLimit.error);
    return errorResponse("Não foi possível exportar os contratos neste momento.", 500);
  }
  if (!rateLimit.allowed) {
    return errorResponse(
      "Foram efetuadas demasiadas exportações. Tente novamente dentro de instantes.",
      429,
      { "Retry-After": String(rateLimit.retryAfterSeconds) },
    );
  }

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity_nif") || searchParams.get("entity") || null;
  const winner = searchParams.get("winner_nif") || searchParams.get("winner") || null;
  const cpv = searchParams.get("cpv") || null;
  const procedure = searchParams.get("procedure") || null;
  const minValue = parseNumber(searchParams.get("min_value"));
  const maxValue = parseNumber(searchParams.get("max_value"));
  const fromRaw = searchParams.get("from_date") ?? "";
  const toRaw = searchParams.get("to_date") ?? "";
  const fromDate = isIsoDate(fromRaw) ? fromRaw : null;
  const toDate = isIsoDate(toRaw) ? toRaw : null;
  const allowedSort = new Set(["signing_date", "publication_date", "value_desc", "value_asc"]);
  const requestedSort = searchParams.get("sort") ?? "signing_date";
  const sort = allowedSort.has(requestedSort) ? requestedSort : "signing_date";

  const adminSupabase = await createAdminClient();
  const { data, error } = await adminSupabase.rpc("export_contracts_v1", {
    p_tenant_id: auth.user.tenantId,
    p_entity: entity,
    p_winner: winner,
    p_cpv: cpv,
    p_procedure: procedure,
    p_min_value: minValue,
    p_max_value: maxValue,
    p_from_date: fromDate,
    p_to_date: toDate,
    p_sort: sort,
    p_limit: RPC_PAGE_SIZE,
  });

  if (error) {
    console.error("Contract export RPC failed", error);
    return errorResponse("Não foi possível exportar os contratos neste momento.", 500);
  }

  const result = parseContractExportEnvelope<ContractRow>(data);
  if (!result) {
    console.error("Contract export RPC returned a malformed envelope");
    return errorResponse("Não foi possível exportar os contratos neste momento.", 500);
  }
  const { rows } = result;
  const classification = classifyContractExport(rows.length, result.hasMore, MAX_EXPORT_ROWS);
  if (classification === "malformed") {
    console.error("Contract export RPC returned malformed has_more");
    return errorResponse("Não foi possível exportar os contratos neste momento.", 500);
  }
  if (classification === "too_large") {
    return errorResponse(
      `A exportação excede ${MAX_EXPORT_ROWS} contratos. Reduza o intervalo ou aplique mais filtros.`,
      413,
    );
  }


  const headers = [
    "ID do Contrato",
    "Objeto",
    "Entidade(s) adjudicante(s)",
    "Vencedor(es)",
    "Tipo de procedimento",
    "Data de publicação",
    "Data de celebração",
    "CPV principal",
    "Preço base",
    "Preço contratual",
    "Preço efetivo",
    "Moeda",
    "Estado",
  ];
  const csvRows = rows.map((row) => [
    row.base_contract_id ?? "",
    row.object ?? "",
    parties(row.contracting_entities),
    parties(row.winners),
    row.procedure_type ?? "",
    row.publication_date ?? "",
    row.signing_date ?? "",
    row.cpv_main ?? "",
    row.base_price,
    row.contract_price,
    row.effective_price,
    row.currency ?? "EUR",
    row.status ?? "",
  ]);

  return new NextResponse(buildSemicolonCsv(headers, csvRows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contratos-${new Date().toISOString().slice(0, 10)}.csv"`,
      ...PRIVATE_NO_STORE_HEADERS,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    return await exportContracts(req);
  } catch (error) {
    console.error("[contracts-export] unexpected failure", error);
    return errorResponse("Não foi possível exportar os contratos neste momento.", 500);
  }
}
