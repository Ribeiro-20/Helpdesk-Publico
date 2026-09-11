import { cleanAnnouncementText, extractProcedurePiecesUrl } from "@/lib/announcements";
import { buildSemicolonCsv, PRIVATE_NO_STORE_HEADERS } from "@/lib/export-csv";
import { requireBackofficeUser } from "@/lib/server/backoffice-export-auth";
import { consumeBackofficeExportRateLimit } from "@/lib/server/backoffice-export-rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_EXPORT_ROWS = 5000;
const CHUNK_SIZE = 500;
const SORTABLE = new Set(["publication_date", "base_price", "proposal_deadline_at"]);

const ACT_TYPE_VARIANTS: Record<string, string[]> = {
  "Anúncio de procedimento": ["Anúncio de procedimento"],
  "Anúncio de concurso urgente": ["Anúncio de concurso urgente", "Anuncio de concurso urgente"],
  "Declaração de retificação de anúncio": ["Declaração de retificação de anúncio", "Declaracao de retificacao de anuncio"],
  "Aviso de prorrogação de prazo": ["Aviso de prorrogação de prazo", "Aviso de prorrogacao de prazo"],
  "Anúncio de Alteração": ["Anúncio de Alteração", "Anúncio de alteração", "Anuncio de Alteracao"],
};
const CONTRACT_TYPE_VARIANTS: Record<string, string[]> = {
  "Aquisição de bens móveis": ["Aquisição de bens móveis", "Aquisição de Bens Móveis"],
  "Aquisição de serviços": ["Aquisição de serviços", "Aquisição de Serviços"],
  "Concessão de obras públicas": ["Concessão de obras públicas", "Concessão de Obras Públicas"],
  "Concessão de serviços públicos": ["Concessão de serviços públicos", "Concessão de Serviços Públicos"],
  "Empreitadas de obras públicas": ["Empreitadas de obras públicas", "Empreitada de Obras Públicas"],
  "Locação de bens móveis": ["Locação de bens móveis", "Locação de Bens Móveis"],
  Sociedade: ["Sociedade"],
  Outros: ["Outros"],
};
const PROCEDURE_TYPE_VARIANTS: Record<string, string[]> = {
  "Concurso público": ["Concurso público", "Concurso Publico"],
  "Concurso público urgente": ["Concurso público urgente", "Concurso Publico urgente"],
  "Concurso limitado por prévia qualificação": ["Concurso limitado por prévia qualificação", "Concurso limitado por previa qualificacao"],
  "Procedimento de negociação": ["Procedimento de negociação", "Procedimento de negociacao"],
  "Diálogo concorrencial": ["Diálogo concorrencial", "Dialogo concorrencial"],
  "Concurso de conceção": ["Concurso de conceção", "Concurso de concecao"],
  "Anúncio simplificado": ["Anúncio simplificado", "Anuncio simplificado"],
  "Instituição de sistema de qualificação": ["Instituição de sistema de qualificação", "Instituicao de sistema de qualificacao"],
  "Intenção de celebração de empreitadas de obras públicas por concessionários que não sejam entidades adjudicantes": ["Intenção de celebração de empreitadas de obras públicas por concessionários que não sejam entidades adjudicantes", "Intencao de celebracao de empreitadas de obras publicas por concessionarios que nao sejam entidades adjudicantes"],
  "Parceria para a inovação": ["Parceria para a inovação", "Parceria para a inovacao"],
  "Concurso de ideias": ["Concurso de ideias"],
  "Instituição de sistema de aquisição dinâmico": ["Instituição de sistema de aquisição dinâmico", "Instituicao de sistema de aquisicao dinamico"],
  "Hasta Pública de Alienação de Bens Móveis": ["Hasta Pública de Alienação de Bens Móveis", "Hasta Publica de Alienacao de Bens Moveis"],
  "Aquisição de Serviços Sociais e de Outros Serviços Específicos": ["Aquisição de Serviços Sociais e de Outros Serviços Específicos", "Aquisição de serviços sociais e de outros serviços específicos", "Aquisicao de Servicos Sociais e de Outros Servicos Especificos"],
  "Anúncio de Adjudicação de Aquisição de Serviços Sociais e de Outros Serviços Específicos": ["Anúncio de Adjudicação de Aquisição de Serviços Sociais e de Outros Serviços Específicos", "Anuncio de Adjudicacao de Aquisicao de Servicos Sociais e de Outros Servicos Especificos"],
  "Concurso público simplificado": ["Concurso público simplificado", "Concurso Publico simplificado"],
  "Concurso limitado por prévia qualificação simplificado": ["Concurso limitado por prévia qualificação simplificado", "Concurso limitado por previa qualificacao simplificado"],
};

type AnnouncementRow = {
  id: string;
  title: string | null;
  entity_name: string | null;
  entity_nif: string | null;
  publication_date: string | null;
  created_at: string | null;
  cpv_main: string | null;
  cpv_list: unknown;
  base_price: number | null;
  currency: string | null;
  proposal_deadline_at: string | null;
  raw_payload: unknown;
  act_type: string | null;
  procedure_type: string | null;
  contract_type: string | null;
  base_announcement_id: string | null;
  dr_announcement_no: string | null;
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function finiteNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function cpvFilters(raw: string): string[] {
  return Array.from(new Set(raw.split(/[;,\n]+/).map((value) => value.trim()).filter(Boolean)));
}

function cpvClause(values: string[]): string {
  return Array.from(new Set(values.flatMap((value) => {
    const digits = value.replace(/\D/g, "");
    const core = digits.length >= 8 ? digits.slice(0, 8) : "";
    return core && core !== value.replace(/\s+/g, "")
      ? [`cpv_main.ilike.%${value}%`, `cpv_main.ilike.%${core}%`]
      : [`cpv_main.ilike.%${value}%`];
  }))).join(",");
}

function normalizeEntitySearch(value: string): string {
  return value
    .toLocaleLowerCase("pt-PT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function entitySearchTerms(value: string): string[] {
  const normalized = normalizeEntitySearch(value);
  if (!normalized) return [];
  const stopWords = new Set(["de", "do", "da", "dos", "das", "e", "a", "o"]);
  const terms = normalized.split(" ").filter((term) => term.length >= 3 && !stopWords.has(term));
  const unique = Array.from(new Set(terms));
  return unique.length ? unique.slice(0, 5) : [normalized];
}

function diacriticVariants(token: string, maxVariants = 32): string[] {
  const groups: Record<string, string[]> = {
    a: ["a", "á", "à", "â", "ã"], e: ["e", "é", "ê"], i: ["i", "í"],
    o: ["o", "ó", "ô", "õ"], u: ["u", "ú"], c: ["c", "ç"],
  };
  let output = [""];
  for (const char of token.toLocaleLowerCase("pt-PT")) {
    const next: string[] = [];
    for (const base of output) {
      for (const choice of groups[char] ?? [char]) {
        next.push(base + choice);
        if (next.length >= maxVariants) break;
      }
      if (next.length >= maxVariants) break;
    }
    output = next.length ? next : output;
    if (output.length >= maxVariants) break;
  }
  return Array.from(new Set(output.filter(Boolean)));
}

function entityNameClause(value: string): string | null {
  const terms = entitySearchTerms(value)
    .map((term) => term.replace(/[%,]/g, " ").trim())
    .filter(Boolean);
  if (!terms.length) return null;
  const groups = terms.map((term) => {
    const clauses = diacriticVariants(term).map((variant) => `entity_name.ilike.%${variant}%`);
    return clauses.length === 1 ? clauses[0] : `or(${clauses.join(",")})`;
  });
  return groups.length === 1 ? groups[0] : `and(${groups.join(",")})`;
}

function variants(values: string[], catalog: Record<string, string[]>): string[] {
  return Array.from(new Set(values.flatMap((value) => catalog[value] ?? [value])));
}


function announcementCpvs(row: AnnouncementRow): string {
  const values = Array.isArray(row.cpv_list) ? row.cpv_list : row.cpv_main ? [row.cpv_main] : [];
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))).join("; ");
}

function errorResponse(error: string, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(
    { error },
    { status, headers: { ...PRIVATE_NO_STORE_HEADERS, ...headers } },
  );
}

async function exportAnnouncements(req: NextRequest) {
  const auth = await requireBackofficeUser();
  if (!auth.ok) return errorResponse(auth.error, auth.status);

  const rateLimit = await consumeBackofficeExportRateLimit(auth.supabase);
  if (!rateLimit.ok) {
    console.error("Announcement export rate-limit check failed", rateLimit.error);
    return errorResponse("Não foi possível exportar os anúncios neste momento.", 500);
  }
  if (!rateLimit.allowed) {
    return errorResponse(
      "Foram efetuadas demasiadas exportações. Tente novamente dentro de instantes.",
      429,
      { "Retry-After": String(rateLimit.retryAfterSeconds) },
    );
  }

  const { searchParams } = new URL(req.url);
  const cpv = searchParams.get("cpv") ?? "";
  const entity = (searchParams.get("entity") ?? "").trim();
  const announcementNumber = (searchParams.get("announcement_number") ?? "").trim();
  const actTypes = Array.from(new Set(searchParams.getAll("act_type").flatMap((value) => value.split("|")).map((value) => value.trim()).filter(Boolean)));
  const procedureTypes = Array.from(new Set(searchParams.getAll("procedure_type").flatMap((value) => value.split("|")).map((value) => value.trim()).filter(Boolean)));
  const contractTypes = Array.from(new Set(searchParams.getAll("contract_type").flatMap((value) => value.split("|")).map((value) => value.trim()).filter(Boolean)));
  const minValue = finiteNumber(searchParams.get("min_value") ?? "");
  const maxValue = finiteNumber(searchParams.get("max_value") ?? "");
  const fromRaw = searchParams.get("from_date") ?? "";
  const toRaw = searchParams.get("to_date") ?? "";
  const fromDate = isIsoDate(fromRaw) ? fromRaw : "";
  const toDate = isIsoDate(toRaw) ? toRaw : "";
  const requestedSort = searchParams.get("sort") ?? "publication_date";
  const sort = SORTABLE.has(requestedSort) ? requestedSort : "publication_date";
  const ascending = searchParams.get("dir") === "asc";

  const rows: AnnouncementRow[] = [];
  let offset = 0;
  while (rows.length <= MAX_EXPORT_ROWS) {
    let query = auth.supabase
      .from("announcements")
      .select("id, title, entity_name, entity_nif, publication_date, created_at, cpv_main, cpv_list, base_price, currency, proposal_deadline_at, raw_payload, act_type, procedure_type, contract_type, base_announcement_id, dr_announcement_no")
      .eq("tenant_id", auth.user.tenantId);

    const selectedCpvs = cpvFilters(cpv);
    if (selectedCpvs.length) query = query.or(cpvClause(selectedCpvs));
    if (entity) {
      const nif = entity.replace(/\D/g, "");
      const nameClause = entityNameClause(entity);
      const clauses = [
        ...(nameClause ? [nameClause] : []),
        ...(nif.length >= 5 ? [`entity_nif.ilike.%${nif}%`] : []),
      ];
      if (clauses.length === 1) {
        query = clauses[0].startsWith("entity_name.ilike.")
          ? query.ilike("entity_name", clauses[0].replace("entity_name.ilike.", ""))
          : clauses[0].startsWith("entity_nif.ilike.")
            ? query.ilike("entity_nif", clauses[0].replace("entity_nif.ilike.", ""))
            : query.or(clauses[0]);
      } else if (clauses.length > 1) {
        query = query.or(clauses.join(","));
      }
    }
    if (announcementNumber) query = query.or(`dr_announcement_no.ilike.%${announcementNumber}%,base_announcement_id.ilike.%${announcementNumber}%`);
    if (actTypes.length) query = query.in("act_type", variants(actTypes, ACT_TYPE_VARIANTS));
    if (procedureTypes.length) query = query.in("procedure_type", variants(procedureTypes, PROCEDURE_TYPE_VARIANTS));
    if (contractTypes.length) query = query.in("contract_type", variants(contractTypes, CONTRACT_TYPE_VARIANTS));
    if (minValue !== null) query = query.gte("base_price", minValue);
    if (maxValue !== null) query = query.lte("base_price", maxValue);
    if (fromDate) query = query.gte("publication_date", fromDate);
    if (toDate) query = query.lte("publication_date", toDate);

    query = sort === "publication_date"
      ? query.order("publication_date", { ascending, nullsFirst: false }).order("created_at", { ascending, nullsFirst: false }).order("id", { ascending })
      : query.order(sort, { ascending, nullsFirst: false }).order("publication_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false });
    const { data, error } = await query.range(offset, offset + CHUNK_SIZE - 1);
    if (error) {
      console.error("Announcement export query failed", error);
      return errorResponse("Não foi possível exportar os anúncios neste momento.", 500);
    }
    const chunk = (data ?? []) as AnnouncementRow[];
    rows.push(...chunk);
    if (chunk.length < CHUNK_SIZE) break;
    offset += chunk.length;
  }

  if (rows.length > MAX_EXPORT_ROWS) {
    return errorResponse(
      `A exportação excede ${MAX_EXPORT_ROWS} anúncios. Reduza o intervalo ou aplique mais filtros.`,
      413,
    );
  }

  const headers = ["Número do anúncio", "Data de publicação", "Objeto do procedimento", "Entidade(s)", "Preço base", "Moeda", "CPVs", "Tipo de ato", "Modelo do anúncio", "Tipo de contrato", "Peças do procedimento", "ID do procedimento"];
  const csvRows = rows.map((row) => [
    row.dr_announcement_no ?? row.base_announcement_id ?? "",
    row.publication_date ?? "",
    cleanAnnouncementText(row.title),
    row.entity_name ? `${cleanAnnouncementText(row.entity_name)}${row.entity_nif ? ` (${row.entity_nif})` : ""}` : "",
    row.base_price,
    row.currency ?? "EUR",
    announcementCpvs(row),
    cleanAnnouncementText(row.act_type),
    cleanAnnouncementText(row.procedure_type),
    cleanAnnouncementText(row.contract_type),
    extractProcedurePiecesUrl(row.raw_payload) ?? "",
    row.base_announcement_id ?? "",
  ]);

  return new NextResponse(buildSemicolonCsv(headers, csvRows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="anuncios-${new Date().toISOString().slice(0, 10)}.csv"`,
      ...PRIVATE_NO_STORE_HEADERS,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    return await exportAnnouncements(req);
  } catch (error) {
    console.error("[announcements-export] unexpected failure", error);
    return errorResponse("Não foi possível exportar os anúncios neste momento.", 500);
  }
}
