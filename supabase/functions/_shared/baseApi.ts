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

/** Safely parse JSON from a BASE API response, handling plain-text errors. */
async function safeParseJson(response: Response, label: string): Promise<unknown> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BASE API ${response.status}: ${text.slice(0, 300)}`);
  }
  // Parse directly from the response body to avoid duplicating large payloads
  // in memory (response.text() + JSON.parse(text)).
  try {
    return await response.json();
  } catch {
    throw new Error(`BASE API ${label}: resposta nao-JSON`);
  }
}

/**
 * Fetch with retry + exponential backoff.
 * The BASE API is unreliable — returns non-standard HTTP codes (e.g. 546)
 * and occasional timeouts. We retry up to 3 times with 2s/4s/8s delays.
 */
async function fetchWithRetry(
  url: string,
  opts: RequestInit,
  label: string,
  maxRetries = 3,
): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, opts);
      return await safeParseJson(response, label);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delayMs = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
        console.warn(
          `[BASE API] ${label} attempt ${attempt + 1} failed: ${lastError.message} — retrying in ${delayMs}ms`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

/** Fetch all announcements for a given year from the BASE API. */
async function fetchByYear(year: number): Promise<Record<string, unknown>[]> {
  const baseUrl = getEnv("BASE_API_URL") || "https://www.base.gov.pt/APIBase2";
  const url = `${baseUrl}/GetInfoAnuncio?Ano=${year}`;

  console.log(`[BASE API] GET ${url}`);

  const data = await fetchWithRetry(url, { headers: buildHeaders() }, `GetInfoAnuncio?Ano=${year}`);
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
    let inRange = 0;

    for (const item of items) {
      const raw = item.dataPublicacao as string | undefined;
      const date = raw ? parsePtDate(raw) : null;
      if (!date) continue;
      if (date >= fromDate && date <= toDate) {
        all.push(item);
        inRange++;
      }
    }

    console.log(
      `[BASE API] year=${year}: ${items.length} total, ${inRange} in range`,
    );
  }

  return all;
}

// ---------------------------------------------------------------------------
// Contracts – GetInfoContrato
// ---------------------------------------------------------------------------

export interface BaseContractMapped {
  base_contract_id: string | null;
  base_procedure_id: string | null;
  base_announcement_no: string | null;
  base_incm_id: string | null;
  object: string | null;
  description: string | null;
  procedure_type: string | null;
  contract_type: string | null;
  announcement_type: string | null;
  legal_regime: string | null;
  legal_basis: string | null;
  publication_date: string | null;
  award_date: string | null;
  signing_date: string | null;
  close_date: string | null;
  base_price: number | null;
  contract_price: number | null;
  effective_price: number | null;
  currency: string;
  contracting_entities: string[];
  winners: string[];
  competitors: string | null;
  cpv_main: string | null;
  cpv_list: string[];
  execution_deadline_days: number | null;
  execution_locations: string[];
  framework_agreement: string | null;
  is_centralized: boolean;
  is_ecological: boolean;
  end_type: string | null;
  procedure_docs_url: string | null;
  observations: string | null;
  raw_payload: Record<string, unknown>;
}

/**
 * Parse price string from BASE API.
 * Handles "123.456,78" (PT format) and "123456.78" (EN format).
 */
function parsePrice(val: unknown): number | null {
  if (val == null || val === "") return null;
  const s = String(val).replace(/\s/g, "");
  // PT format: "1.234.567,89" → remove dots, replace comma with dot
  if (s.includes(",")) {
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Parse a "NIF - Nome" string into { nif, name }.
 * Format: "509000001 - Empresa Exemplo, Lda."
 */
export function parseNifNome(raw: string): { nif: string; name: string } {
  const idx = raw.indexOf(" - ");
  if (idx === -1) return { nif: raw.trim(), name: raw.trim() };
  return { nif: raw.slice(0, idx).trim(), name: raw.slice(idx + 3).trim() };
}

/**
 * Fetch all contracts for a given year from the BASE API.
 * Endpoint: GET /APIBase2/GetInfoContrato?Ano=YYYY
 */
async function fetchContractsByYear(year: number): Promise<Record<string, unknown>[]> {
  const baseUrl = getEnv("BASE_API_URL") || "https://www.base.gov.pt/APIBase2";
  const url = `${baseUrl}/GetInfoContrato?Ano=${year}`;

  console.log(`[BASE API] GET ${url}`);

  const data = await fetchWithRetry(url, { headers: buildHeaders() }, `GetInfoContrato?Ano=${year}`);
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch all contracts between fromDate and toDate (YYYY-MM-DD).
 * Queries by year and filters client-side by dataCelebracaoContrato
 * (signing date), which matches how the BASE website filters contracts.
 *
 * The API's Ano parameter groups by publication year, so we may need
 * to query multiple years if contracts signed in the requested range
 * were published in a different year (rare but possible).
 */
export async function listAllContracts(
  fromDate: string,
  toDate: string,
): Promise<Record<string, unknown>[]> {
  const fromYear = parseInt(fromDate.slice(0, 4));
  const toYear = parseInt(toDate.slice(0, 4));

  const all: Record<string, unknown>[] = [];

  for (let year = fromYear; year <= toYear; year++) {
    const items = await fetchContractsByYear(year);
    let inRange = 0;

    for (const item of items) {
      // Filter by signing date (dataCelebracaoContrato) — matches BASE website
      const rawSigning = item.dataCelebracaoContrato as string | undefined;
      const date = rawSigning ? parsePtDate(rawSigning) : null;
      if (!date) continue;
      if (date >= fromDate && date <= toDate) {
        all.push(item);
        inRange++;
      }
    }

    console.log(
      `[BASE API] contracts year=${year}: ${items.length} total, ${inRange} in range [${fromDate}..${toDate}] (by signing date)`,
    );
  }

  return all;
}

/** Map a raw BASE API contract payload to the DB schema. */
export function mapToContract(
  payload: Record<string, unknown>,
): BaseContractMapped {
  const rawCpvs = Array.isArray(payload.cpv)
    ? (payload.cpv as string[]).map(extractCpvCode)
    : [];
  const cpvMain = rawCpvs[0] ?? null;

  const publicationDate = parsePtDate(payload.dataPublicacao as string) ?? null;
  const awardDate = parsePtDate(payload.dataDecisaoAdjudicacao as string) ?? null;
  const signingDate = parsePtDate(payload.dataCelebracaoContrato as string) ?? null;
  const closeDate = parsePtDate(payload.dataFechoContrato as string) ?? null;

  // Use signing date (dataCelebracaoContrato) as the primary date for the record.
  // This matches the BASE website, which filters/displays by signing date.
  // publication_date in our DB stores this signing date for ordering/display.
  // The BASE portal publication date (dataPublicacao) is stored in raw_payload.
  const effectiveDate = signingDate ?? publicationDate;

  const contractType = Array.isArray(payload.tipoContrato)
    ? (payload.tipoContrato as string[])[0] ?? null
    : typeof payload.tipoContrato === "string"
    ? payload.tipoContrato
    : null;

  const contractingEntities = Array.isArray(payload.adjudicante)
    ? (payload.adjudicante as string[])
    : [];

  const winners = Array.isArray(payload.adjudicatarios)
    ? (payload.adjudicatarios as string[])
    : [];

  const executionLocations = Array.isArray(payload.localExecucao)
    ? (payload.localExecucao as string[])
    : [];

  const executionDays = typeof payload.prazoExecucao === "number"
    ? payload.prazoExecucao
    : payload.prazoExecucao
    ? parseInt(String(payload.prazoExecucao)) || null
    : null;

  return {
    base_contract_id: (payload.idcontrato ?? payload.idContrato) ? String(payload.idcontrato ?? payload.idContrato) : null,
    base_procedure_id: payload.idprocedimento ? String(payload.idprocedimento) : null,
    base_announcement_no: payload.nAnuncio ? String(payload.nAnuncio) : null,
    base_incm_id: payload.idINCM ? String(payload.idINCM) : null,
    object: (payload.objectoContrato as string | undefined)?.trim() || null,
    description: (payload.descContrato as string | undefined)?.trim() || null,
    procedure_type: (payload.tipoprocedimento as string | undefined) ?? null,
    contract_type: contractType,
    announcement_type: (payload.TipoAnuncio as string | undefined) ?? null,
    legal_regime: (payload.regime as string | undefined) ?? null,
    legal_basis: (payload.fundamentacao as string | undefined) ?? null,
    publication_date: effectiveDate,
    award_date: awardDate,
    signing_date: signingDate,
    close_date: closeDate,
    base_price: parsePrice(payload.precoBaseProcedimento),
    contract_price: parsePrice(payload.precoContratual),
    effective_price: parsePrice(payload.PrecoTotalEfetivo),
    currency: "EUR",
    contracting_entities: contractingEntities,
    winners: winners,
    competitors: (payload.concorrentes as string | undefined) ?? null,
    cpv_main: cpvMain,
    cpv_list: rawCpvs,
    execution_deadline_days: executionDays,
    execution_locations: executionLocations,
    framework_agreement: (payload.DescrAcordoQuadro as string | undefined) ?? null,
    is_centralized: String(payload.ProcedimentoCentralizado).toLowerCase() === "sim",
    is_ecological: String(payload.ContratEcologico).toLowerCase() === "sim",
    end_type: (payload.tipoFimContrato as string | undefined) ?? null,
    procedure_docs_url: (payload.linkPecasProc as string | undefined) ?? null,
    observations: (payload.Observacoes as string | undefined) ?? null,
    raw_payload: payload,
  };
}

// ---------------------------------------------------------------------------
// Contract modifications – GetInfoModContrat
// ---------------------------------------------------------------------------

/**
 * Fetch contract modifications for a given year.
 * Endpoint: GET /APIBase2/GetInfoModContrat?Ano=YYYY
 */
export async function fetchContractModsByYear(year: number): Promise<Record<string, unknown>[]> {
  const baseUrl = getEnv("BASE_API_URL") || "https://www.base.gov.pt/APIBase2";
  const url = `${baseUrl}/GetInfoModContrat?Ano=${year}`;

  console.log(`[BASE API] GET ${url}`);

  const data = await fetchWithRetry(url, { headers: buildHeaders() }, `GetInfoModContrat?Ano=${year}`);
  return Array.isArray(data) ? data : [];
}

// ---------------------------------------------------------------------------
// Announcements – GetInfoAnuncio (existing)
// ---------------------------------------------------------------------------

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
