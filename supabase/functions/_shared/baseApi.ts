/**
 * BASE API adapter.
 */

export interface BaseAnnouncementMapped {
  base_announcement_id: string | null;
  dr_announcement_no: string | null;
  publication_date: string;
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
  const denoEnv = (globalThis as typeof globalThis & {
    Deno?: { env?: { get: (name: string) => string | undefined } };
  }).Deno?.env;

  return denoEnv?.get(key) ?? "";
}

function getBaseApiToken(): string {
  const token = getEnv("BASE_API_TOKEN").trim();
  if (!token || token === "<your BASE API token>") {
    throw new Error(
      "BASE_API_TOKEN nao configurado. Defina um token valido em supabase/functions/.env (ou via supabase secrets).",
    );
  }
  return token;
}

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

function buildHeaders(): Record<string, string> {
  return {
    "_AcessToken": getBaseApiToken(),
    "Accept": "application/json",
  };
}

function parsePtDate(str: string): string | null {
  if (!str) return null;
  const value = String(str).trim();

  // PT format: DD/MM/YYYY
  const pt = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (pt) return `${pt[3]}-${pt[2]}-${pt[1]}`;

  // Alternative PT format: DD-MM-YYYY
  const ptDash = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ptDash) return `${ptDash[3]}-${ptDash[2]}-${ptDash[1]}`;

  // ISO date or datetime: YYYY-MM-DD[THH:mm:ss...]
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

function extractCpvCode(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (!value || value === "-" || value === "—") return "";

  const embedded = value.match(/\b\d{8}(?:-\d)?\b/);
  if (embedded) return embedded[0];

  const digits = value.replace(/\D/g, "");
  if (digits.length === 9) return `${digits.slice(0, 8)}-${digits[8]}`;
  if (digits.length === 8) return digits;

  return "";
}

async function safeParseJson(response: Response, label: string, maxItems?: number): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  console.log(`[BASE API] ${label} response: status=${response.status} content-length=${contentLength ?? "unknown"}`);

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`BASE API ${response.status}: ${text.slice(0, 300)}`);
  }

  try {
    const parsed = JSON.parse(text);
    let data = Array.isArray(parsed) ? parsed : [];
    
    if (maxItems && data.length > maxItems) {
      console.log(`[BASE API] ${label}: limiting ${data.length} items to ${maxItems}`);
      data = data.slice(0, maxItems);
    }
    
    const count = data.length;
    console.log(`[BASE API] ${label} parsed OK: ${count} items`);
    return data;
  } catch {
    const sample = text.replace(/\s+/g, " ").slice(0, 200);
    throw new Error(`BASE API ${label}: resposta nao-JSON - ${sample}`);
  }
}

async function fetchWithRetry(
  url: string,
  opts: RequestInit,
  label: string,
  maxRetries = 3,
  maxItems?: number,
): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const t0 = Date.now();
    try {
      console.log(`[BASE API] ${label} attempt ${attempt + 1}/${maxRetries + 1}: GET ${url}`);
      const response = await fetch(url, opts);
      const result = await safeParseJson(response, label, maxItems);
      console.log(`[BASE API] ${label} attempt ${attempt + 1} succeeded in ${Date.now() - t0}ms`);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[BASE API] ${label} attempt ${attempt + 1} failed after ${Date.now() - t0}ms: ${lastError.message}`);
      if (attempt < maxRetries) {
        const delayMs = 2000 * Math.pow(2, attempt);
        console.warn(`[BASE API] ${label} - retrying in ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  console.error(`[BASE API] ${label} all ${maxRetries + 1} attempts failed`);
  throw lastError;
}

async function fetchAnnouncementsByYear(year: number): Promise<Record<string, unknown>[]> {
  const baseUrl = getEnv("BASE_API_URL") || "https://www.base.gov.pt/APIBase2";
  const url = `${baseUrl}/GetInfoAnuncio?Ano=${year}`;
  console.log(`[BASE API] GET ${url}`);
  const data = await fetchWithRetry(url, { headers: buildHeaders() }, `GetInfoAnuncio?Ano=${year}`, 3);
  return Array.isArray(data) ? data : [];
}

export async function forEachAnnouncementsChunk(
  fromDate: string,
  toDate: string,
  chunkSize: number,
  onChunk: (chunk: Record<string, unknown>[]) => Promise<void>,
): Promise<number> {
  const fromYear = parseInt(fromDate.slice(0, 4));
  const toYear = parseInt(toDate.slice(0, 4));
  let totalFiltered = 0;

  for (let year = fromYear; year <= toYear; year++) {
    let items = await fetchAnnouncementsByYear(year);
    const yearTotal = items.length;
    const chunk: Record<string, unknown>[] = [];
    let yearFiltered = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const raw = item.dataPublicacao as string | undefined;
      const date = raw ? parsePtDate(raw) : null;
      if (date && date >= fromDate && date <= toDate) {
        chunk.push(item);
        yearFiltered++;
        totalFiltered++;
      }

      items[i] = null as unknown as Record<string, unknown>;

      if (chunk.length >= chunkSize) {
        await onChunk([...chunk]);
        chunk.length = 0;
      }
    }

    if (chunk.length > 0) {
      await onChunk([...chunk]);
      chunk.length = 0;
    }

    console.log(`[BASE API] year=${year}: ${yearTotal} total, ${yearFiltered} in range`);
    items = null as unknown as Record<string, unknown>[];
  }

  return totalFiltered;
}

export async function listAllAnnouncements(
  fromDate: string,
  toDate: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  await forEachAnnouncementsChunk(fromDate, toDate, 1000, async (chunk) => {
    all.push(...chunk);
  });
  return all;
}

function parsePrice(val: unknown): number | null {
  if (val == null || val === "") return null;
  const s = String(val).replace(/\s/g, "");
  if (s.includes(",")) {
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function parseNifNome(raw: string): { nif: string; name: string } {
  const idx = raw.indexOf(" - ");
  if (idx === -1) return { nif: raw.trim(), name: raw.trim() };
  return { nif: raw.slice(0, idx).trim(), name: raw.slice(idx + 3).trim() };
}

async function fetchContractsByYear(year: number): Promise<Record<string, unknown>[]> {
  const baseUrl = getEnv("BASE_API_URL") || "https://www.base.gov.pt/APIBase2";
  const url = `${baseUrl}/GetInfoContrato?Ano=${year}`;
  console.log(`[BASE API] fetchContractsByYear(${year}): GET ${url}`);
  const t0 = Date.now();
  const data = await fetchWithRetry(url, { headers: buildHeaders() }, `GetInfoContrato?Ano=${year}`, 3);
  const items = Array.isArray(data) ? data : [];
  console.log(`[BASE API] fetchContractsByYear(${year}): got ${items.length} contracts in ${Date.now() - t0}ms`);
  return items;
}

export async function forEachContractsChunk(
  fromDate: string,
  toDate: string,
  chunkSize: number,
  onChunk: (chunk: Record<string, unknown>[]) => Promise<void>,
  yearFilter?: number,
): Promise<number> {
  const fromYear = yearFilter ?? parseInt(fromDate.slice(0, 4));
  const toYear = yearFilter ?? parseInt(toDate.slice(0, 4));
  let totalFiltered = 0;

  for (let year = fromYear; year <= toYear; year++) {
    let items = await fetchContractsByYear(year);
    const yearTotal = items.length;
    const chunk: Record<string, unknown>[] = [];
    let yearFiltered = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rawSigning = item.dataCelebracaoContrato as string | undefined;
      const rawPublication = item.dataPublicacao as string | undefined;
      const date = rawSigning ? parsePtDate(rawSigning) : (rawPublication ? parsePtDate(rawPublication) : null);
      if (date && date >= fromDate && date <= toDate) {
        chunk.push(item);
        yearFiltered++;
        totalFiltered++;
      }

      items[i] = null as unknown as Record<string, unknown>;

      if (chunk.length >= chunkSize) {
        await onChunk([...chunk]);
        chunk.length = 0;
      }
    }

    if (chunk.length > 0) {
      await onChunk([...chunk]);
      chunk.length = 0;
    }

    console.log(`[BASE API] contracts year=${year}: ${yearTotal} total, ${yearFiltered} in range [${fromDate}..${toDate}] (by signing date, fallback publication date)`);
    items = null as unknown as Record<string, unknown>[];
  }

  return totalFiltered;
}

export async function listAllContracts(
  fromDate: string,
  toDate: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  await forEachContractsChunk(fromDate, toDate, 1000, async (chunk) => {
    all.push(...chunk);
  });
  return all;
}

export function mapToContract(payload: Record<string, unknown>): BaseContractMapped {
  const rawCpvs = Array.isArray(payload.cpv)
    ? (payload.cpv as string[]).map(extractCpvCode)
    : [];
  const cpvMain = rawCpvs[0] ?? null;

  const publicationDate = parsePtDate(payload.dataPublicacao as string) ?? null;
  const awardDate = parsePtDate(payload.dataDecisaoAdjudicacao as string) ?? null;
  const signingDate = parsePtDate(payload.dataCelebracaoContrato as string) ?? null;
  const closeDate = parsePtDate(payload.dataFechoContrato as string) ?? null;
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
    winners,
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

export async function fetchContractModsByYear(year: number): Promise<Record<string, unknown>[]> {
  const baseUrl = getEnv("BASE_API_URL") || "https://www.base.gov.pt/APIBase2";
  const url = `${baseUrl}/GetInfoModContrat?Ano=${year}`;

  console.log(`[BASE API] GET ${url}`);
  const data = await fetchWithRetry(url, { headers: buildHeaders() }, `GetInfoModContrat?Ano=${year}`);
  return Array.isArray(data) ? data : [];
}

export function mapToAnnouncement(payload: Record<string, unknown>): BaseAnnouncementMapped {
  const rawCpvs = Array.isArray(payload.CPVs)
    ? (payload.CPVs as string[]).map(extractCpvCode)
    : [];
  const cpvMain = rawCpvs[0] ?? null;

  const publicationDate = parsePtDate(payload.dataPublicacao as string) ?? new Date().toISOString().slice(0, 10);
  const contractType = Array.isArray(payload.tiposContrato)
    ? (payload.tiposContrato as string[])[0] ?? null
    : null;
  const basePrice = payload.PrecoBase
    ? parseFloat(String(payload.PrecoBase).replace(",", ".")) || null
    : null;
  const deadlineDays = typeof payload.PrazoPropostas === "number"
    ? payload.PrazoPropostas
    : payload.PrazoPropostas
    ? parseInt(String(payload.PrazoPropostas)) || null
    : null;
  const deadlineAt = deadlineDays !== null
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
    title: (payload.descricaoAnuncio as string | undefined)?.trim() || "Sem titulo",
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
