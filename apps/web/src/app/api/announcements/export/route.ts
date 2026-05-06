import { createClient } from "@/lib/supabase/server";
import { effectiveStatus, STATUS_LABEL } from "@/lib/announcements";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

const CHUNK_SIZE = 500;

const SORTABLE: Record<string, string> = {
  publication_date: "publication_date",
  base_price: "base_price",
  entity_name: "entity_name",
  title: "title",
  status: "proposal_deadline_at",
};

type AnnouncementRow = {
  id: string;
  title: string;
  entity_name: string | null;
  entity_nif: string | null;
  publication_date: string | null;
  cpv_main: string | null;
  cpv_list: unknown;
  base_price: number | null;
  currency: string | null;
  status: string;
  source: string | null;
  proposal_deadline_at: string | null;
  detail_url: string | null;
  act_type: string | null;
  procedure_type: string | null;
  contract_type: string | null;
  base_announcement_id: string | null;
  dr_announcement_no: string | null;
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toIsoDatePt(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-PT");
}

function applyFilters(
  query: any,
  {
    tenantId,
    cpv,
    entity,
    source,
    status,
    fromDate,
    toDate,
  }: {
    tenantId: string | null;
    cpv: string;
    entity: string;
    source: string;
    status: string;
    fromDate: string;
    toDate: string;
  },
) {
  let q = query;

  if (tenantId) q = q.eq("tenant_id", tenantId);
  if (cpv) q = q.ilike("cpv_main", `%${cpv}%`);
  if (entity) q = q.ilike("entity_name", `%${entity}%`);
  if (source) q = q.eq("source", source);

  if (status === "active") {
    const todayIso = new Date().toISOString();
    q = q.eq("status", "active").or(`proposal_deadline_at.is.null,proposal_deadline_at.gte.${todayIso}`);
  } else if (status === "expired") {
    const todayIso = new Date().toISOString();
    q = q.or(`status.eq.expired,and(status.eq.active,proposal_deadline_at.lt.${todayIso})`);
  } else if (status) {
    q = q.eq("status", status);
  }

  if (fromDate) q = q.gte("publication_date", fromDate);
  if (toDate) q = q.lte("publication_date", toDate);

  return q;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const cpv = searchParams.get("cpv") ?? "";
    const entity = searchParams.get("entity") ?? "";
    const source = searchParams.get("source") ?? "";
    const status = searchParams.get("status") ?? "";
    const fromDateRaw = searchParams.get("from_date") ?? "";
    const toDateRaw = searchParams.get("to_date") ?? "";
    const fromDate = isIsoDate(fromDateRaw) ? fromDateRaw : "";
    const toDate = isIsoDate(toDateRaw) ? toDateRaw : "";
    const sortCol = SORTABLE[searchParams.get("sort") ?? ""]
      ? (searchParams.get("sort") as string)
      : "publication_date";
    const sortDir = searchParams.get("dir") === "asc" ? "asc" : "desc";

    const { data: appUser } = await supabase
      .from("app_users")
      .select("tenant_id")
      .maybeSingle();

    const rows: AnnouncementRow[] = [];
    let offset = 0;

    while (true) {
      let query = supabase
        .from("announcements")
        .select(
          "id, title, entity_name, entity_nif, publication_date, cpv_main, cpv_list, base_price, currency, status, source, proposal_deadline_at, detail_url, act_type, procedure_type, contract_type, base_announcement_id, dr_announcement_no",
        )
        .order(SORTABLE[sortCol], {
          ascending: sortDir === "asc",
          nullsFirst: false,
        })
        .range(offset, offset + CHUNK_SIZE - 1);

      query = applyFilters(query, {
        tenantId: appUser?.tenant_id ?? null,
        cpv,
        entity,
        source,
        status,
        fromDate,
        toDate,
      });

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const chunk = (data ?? []) as AnnouncementRow[];
      rows.push(...chunk);

      if (chunk.length < CHUNK_SIZE) break;
      offset += CHUNK_SIZE;
    }

    const now = new Date();
    const worksheetRows = rows.map((ann) => {
      // Entidade(s): "Nome (NIF)" ou só o nome se não houver NIF
      const entidade = ann.entity_name
        ? ann.entity_nif
          ? `${ann.entity_name} (${ann.entity_nif})`
          : ann.entity_name
        : "";

      // Preço Base: formato "250.000,00 €"
      const precoBase =
        ann.base_price != null
          ? `${Number(ann.base_price).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
          : "";

      // CPVs: lista separada por vírgula se houver vários
      const cpvList = Array.isArray(ann.cpv_list) && ann.cpv_list.length > 0
        ? (ann.cpv_list as string[]).join(", ")
        : ann.cpv_main ?? "";

      return {
        "Número do Anúncio": ann.dr_announcement_no ?? ann.base_announcement_id ?? "",
        "Data de Publicação": toIsoDatePt(ann.publication_date),
        "Objeto do Procedimento": ann.title ?? "",
        "Entidade(s)": entidade,
        "Preço Base": precoBase,
        "CPVs": cpvList,
        "Tipo de Ato": ann.act_type ?? "",
        "Modelo do Anúncio": ann.procedure_type ?? "",
        "Tipo de Contrato": ann.contract_type ?? "",
        "Ligação para Peças": ann.detail_url ?? "",
        "ID do Procedimento": ann.base_announcement_id ?? "",
      };
    });

    const headers = [
      "Número do Anúncio",
      "Data de Publicação",
      "Objeto do Procedimento",
      "Entidade(s)",
      "Preço Base",
      "CPVs",
      "Tipo de Ato",
      "Modelo do Anúncio",
      "Tipo de Contrato",
      "Ligação para Peças",
      "ID do Procedimento",
    ];

    const worksheet =
      worksheetRows.length > 0
        ? XLSX.utils.json_to_sheet(worksheetRows, { header: headers })
        : XLSX.utils.aoa_to_sheet([headers]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Anuncios");

    const fileBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `anuncios-${timestamp}.xlsx`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
