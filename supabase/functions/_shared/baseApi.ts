/**
 * BASE (base.gov.pt) API v2 adapter.
 *
 * Endpoint: GET /APIBase2/GetInfoAnuncio?Ano=YYYY
 * Auth:     _AcessToken: <token>
 *
 * Response fields (actual):
 *   nAnuncio, IdIncm, dataPublicacao (DD/MM/YYYY), nifEntidade,
 *   designacaoEntidade, descricaoAnuncio, url, numDR, serie,
 *   tipoActo, tiposContrato[], PrecoBase, CPVs[], modeloAnuncio,
 *   Ano, PrazoPropostas, PecasProcedimento
 */

export interface BaseAnnouncementMapped {
  base_announcement_id: string | null;
  dr_announcement_no: string | null;
  publication_date: string; // YYYY-MM-DD
  title: string;
  description: string | null;
  entity_name: string | null;
  entity_nif: string | null;
  procedure_type: string | null;
  act_type: string | null;
  contract_type: string | null;
  base_price: number | null;
  currency: string;
  cpv_main: string | null;
  cpv_list: string[];
  proposal_deadline_days: number | null;
  proposal_deadline_at: string | null;
  detail_url: string | null;
  raw_payload: Record<string, unknown>;
}

function getEnv(key: string): string {
  return Deno.env.get(key) ?? "";
}

function buildHeaders(): Record<string, string> {
  return {
    "_AcessToken": getEnv("BASE_API_TOKEN"),
    "Accept": "application/json",
  };
}

/** Parse DD/MM/YYYY → YYYY-MM-DD */
function parsePtDate(str: string): string | null {
  const m = str?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Extract CPV code from "66510000-8 - Serviços de seguros" → "66510000-8" */
function extractCpvCode(raw: string): string {
  return raw.split(" - ")[0].trim();
}

/** Fetch all announcements for a given year from the BASE API. */
async function fetchByYear(year: number): Promise<Record<string, unknown>[]> {
  const baseUrl = getEnv("BASE_API_URL") || "https://www.base.gov.pt/APIBase2";
  const url = `${baseUrl}/GetInfoAnuncio?Ano=${year}`;

  console.log(`[BASE API] GET ${url}`);

  const response = await fetch(url, { headers: buildHeaders() });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BASE API ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch all announcements between fromDate and toDate (YYYY-MM-DD).
 * Queries by year and filters client-side by date.
 */
export async function listAllAnnouncements(
  fromDate: string,
  toDate: string,
): Promise<Record<string, unknown>[]> {
  const fromYear = parseInt(fromDate.slice(0, 4));
  const toYear = parseInt(toDate.slice(0, 4));

  const all: Record<string, unknown>[] = [];

  for (let year = fromYear; year <= toYear; year++) {
    const items = await fetchByYear(year);

    const filtered = items.filter((item) => {
      const raw = item.dataPublicacao as string | undefined;
      const date = raw ? parsePtDate(raw) : null;
      if (!date) return false;
      return date >= fromDate && date <= toDate;
    });

    console.log(
      `[BASE API] year=${year}: ${items.length} total, ${filtered.length} in range`,
    );
    all.push(...filtered);
  }

  return all;
}

/** Map a raw BASE API announcement payload to the DB schema. */
export function mapToAnnouncement(
  payload: Record<string, unknown>,
): BaseAnnouncementMapped {
  const rawCpvs = Array.isArray(payload.CPVs)
    ? (payload.CPVs as string[]).map(extractCpvCode)
    : [];

  const cpvMain = rawCpvs[0] ?? null;

  const publicationDate =
    parsePtDate(payload.dataPublicacao as string) ??
    new Date().toISOString().slice(0, 10);

  const contractType = Array.isArray(payload.tiposContrato)
    ? (payload.tiposContrato as string[])[0] ?? null
    : null;

  const basePrice = payload.PrecoBase
    ? parseFloat(String(payload.PrecoBase).replace(",", ".")) || null
    : null;

  const deadlineDays =
    typeof payload.PrazoPropostas === "number"
      ? payload.PrazoPropostas
      : payload.PrazoPropostas
      ? parseInt(String(payload.PrazoPropostas)) || null
      : null;

  const deadlineAt =
    deadlineDays !== null && publicationDate
      ? (() => {
          const d = new Date(publicationDate);
          d.setDate(d.getDate() + deadlineDays);
          return d.toISOString().slice(0, 10) + "T00:00:00Z";
        })()
      : null;

  return {
    base_announcement_id: payload.IdIncm ? String(payload.IdIncm) : null,
    dr_announcement_no: payload.nAnuncio ? String(payload.nAnuncio) : null,
    publication_date: publicationDate,
    title: (payload.descricaoAnuncio as string | undefined)?.trim() || "Sem título",
    description: null,
    entity_name: (payload.designacaoEntidade as string | undefined) ?? null,
    entity_nif: (payload.nifEntidade as string | undefined) ?? null,
    procedure_type: (payload.modeloAnuncio as string | undefined) ?? null,
    act_type: (payload.tipoActo as string | undefined) ?? null,
    contract_type: contractType,
    base_price: basePrice,
    currency: "EUR",
    cpv_main: cpvMain,
    cpv_list: rawCpvs,
    proposal_deadline_days: deadlineDays,
    proposal_deadline_at: deadlineAt,
    detail_url: (payload.url as string | undefined) ?? null,
    raw_payload: payload,
  };
}
