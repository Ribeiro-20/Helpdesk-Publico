import { createClient } from "@/lib/supabase/server";
import { cleanAnnouncementText, effectiveStatus, STATUS_LABEL } from "@/lib/announcements";
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
  raw_payload: unknown;
  act_type: string | null;
  procedure_type: string | null;
  contract_type: string | null;
  base_announcement_id: string | null;
  dr_announcement_no: string | null;
};

type CpvCatalogRow = {
  id: string;
  descricao: string | null;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function rawString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]).trim() : null;
  const normalized = String(value).trim();
  return normalized || null;
}

function pick(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = rawString(payload, key);
    if (value) return value;
  }
  return null;
}

function payloadRoot(rawPayload: unknown): Record<string, unknown> {
  const root = asRecord(rawPayload) ?? {};
  return asRecord(root.payload) ?? root;
}

function extractProcedurePiecesFromText(text: string): string | null {
  if (!text.trim()) return null;

  const labeled = text.match(
    /Link\s+para\s+acesso[^\r\n:]*pe\S*as\s+do\s+concurso\s*\(URL\)\s*:\s*(https?:\/\/[^\s\r\n]+)/i,
  );
  if (labeled) return labeled[1];

  const knownPlatform = text.match(
    /https?:\/\/[^\s\r\n]*(?:downloadProcedurePiece|donwloadProcedurePiece|public-tender-documents|acessoDocs\.jsp\?codigoAcesso=)[^\s\r\n]*/i,
  );
  return knownPlatform ? knownPlatform[0] : null;
}

function extractProcedurePiecesUrl(rawPayload: unknown): string {
  const root = payloadRoot(rawPayload);
  const direct = pick(root, ["PecasProcedimento", "linkPecasProc", "procedure_docs_url"]);
  if (direct) return direct;

  const detail = asRecord(root.detalhe_conteudo);
  const detailText = typeof detail?.Texto === "string" ? detail.Texto : "";
  return extractProcedurePiecesFromText(detailText) ?? "";
}

function normalizeAnnouncementCpvs(ann: AnnouncementRow): string[] {
  const rawList = Array.isArray(ann.cpv_list)
    ? ann.cpv_list
    : ann.cpv_main
    ? [ann.cpv_main]
    : [];

  const out: string[] = [];
  for (const item of rawList) {
    const code = String(item ?? "").trim();
    if (!code) continue;
    out.push(code);
  }

  return Array.from(new Set(out));
}

function formatCpvsForExport(cpvCodes: string[], cpvDescriptions: Record<string, string>): string {
  return cpvCodes
    .map((code) => {
      const description = (cpvDescriptions[code] ?? "").trim();
      return description ? `${code}, ${description}` : code;
    })
    .join("; ");
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
          "id, title, entity_name, entity_nif, publication_date, cpv_main, cpv_list, base_price, currency, status, source, proposal_deadline_at, detail_url, raw_payload, act_type, procedure_type, contract_type, base_announcement_id, dr_announcement_no",
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
    const cpvCodes = Array.from(
      new Set(rows.flatMap((row) => normalizeAnnouncementCpvs(row))),
    );

    let cpvDescriptions: Record<string, string> = {};
    if (cpvCodes.length > 0) {
      const CPV_CHUNK_SIZE = 500;
      const cpvRows: CpvCatalogRow[] = [];

      for (let i = 0; i < cpvCodes.length; i += CPV_CHUNK_SIZE) {
        const chunk = cpvCodes.slice(i, i + CPV_CHUNK_SIZE);
        const { data, error } = await supabase
          .from("cpv_codes")
          .select("id, descricao")
          .in("id", chunk);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        cpvRows.push(...((data ?? []) as CpvCatalogRow[]));
      }

      cpvDescriptions = Object.fromEntries(
        cpvRows.map((row) => [row.id, row.descricao ?? ""]),
      );
    }

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

      // CPVs: formato "cpv, descrição; cpv, descrição"
      const cpvList = formatCpvsForExport(
        normalizeAnnouncementCpvs(ann),
        cpvDescriptions,
      );
      const procedurePiecesUrl = extractProcedurePiecesUrl(ann.raw_payload);

      return {
        "Número do Anúncio": ann.dr_announcement_no ?? ann.base_announcement_id ?? "",
        "Data de Publicação": toIsoDatePt(ann.publication_date),
        "Objeto do Procedimento": cleanAnnouncementText(ann.title),
        "Entidade(s)": cleanAnnouncementText(entidade),
        "Preço Base": precoBase,
        "CPVs": cpvList,
        "Tipo de Ato": cleanAnnouncementText(ann.act_type),
        "Modelo do Anúncio": cleanAnnouncementText(ann.procedure_type),
        "Tipo de Contrato": cleanAnnouncementText(ann.contract_type),
        "Peças do procedimento": procedurePiecesUrl,
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
      "Peças do procedimento",
      "ID do Procedimento",
    ];

    const worksheet =
      worksheetRows.length > 0
        ? XLSX.utils.json_to_sheet(worksheetRows, { header: headers })
        : XLSX.utils.aoa_to_sheet([headers]);

    const fileBuffer = Buffer.concat([
      Buffer.from("\ufeff", "utf8"),
      Buffer.from(XLSX.utils.sheet_to_csv(worksheet, { FS: ";" }), "utf8"),
    ]);

    const selectedDateLabel =
      fromDate && toDate
        ? fromDate === toDate
          ? fromDate
          : `${fromDate}_a_${toDate}`
        : fromDate || toDate || new Date().toISOString().slice(0, 10);
    const filename = `anuncios-${selectedDateLabel}.csv`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
