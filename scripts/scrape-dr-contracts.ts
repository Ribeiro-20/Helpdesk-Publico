import { config as loadDotenv } from "dotenv";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";

type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [k: string]: JsonValue };

interface DrContractCandidate {
  base_announcement_id: string | null;
  title: string;
  detail_url: string | null;
  publication_date: string | null;
  dr_announcement_no: string | null;
  entity_name: string | null;
  entity_nif: string | null;
  act_type: string | null;
  contract_type: string | null;
  base_price: number | null;
  cpv_main: string | null;
  cpv_list: string[];
  proposal_deadline_days: number | null;
  proposal_deadline_at: string | null;
  description: string | null;
  source_url: string;
  raw_payload: JsonValue;
}

interface Args {
  dailyUrl: string | null;
  fromDate: string | null;
  toDate: string | null;
  maxWaitMs: number;
  maxResults: number;
  upsert: boolean;
  outputPath: string;
}

interface DrDetalheConteudo {
  [k: string]: JsonValue | undefined;
  Id?: JsonValue;
  Numero?: JsonValue;
  Sumario?: JsonValue;
  Texto?: JsonValue;
}

const DR_HOME_URL = "https://diariodarepublica.pt/dr/home";

interface HomeContagemSource {
  dbId?: string | number;
  ano?: string | number;
  numero?: string | number;
  parte?: string;
  dataPublicacao?: string;
}

interface HomeContagemHit {
  dbId: string;
  ano: string;
  numero: string;
  parte: string;
  dataPublicacao: string;
}

function parseArgs(argv: string[]): Args {
  const envDailyUrlRaw = process.env.DR_DAILY_URL?.trim() ?? "";
  const envDailyUrl = envDailyUrlRaw && envDailyUrlRaw.toLowerCase() !== "auto"
    ? envDailyUrlRaw
    : null;

  const args: Args = {
    dailyUrl: envDailyUrl,
    fromDate: null,
    toDate: null,
    maxWaitMs: 15000,
    maxResults: 100,
    upsert: false,
    outputPath: resolve(process.cwd(), "output", "dr-contracts.json"),
  };

  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i];
    if (cur === "--daily-url" && argv[i + 1]) {
      const input = argv[++i].trim();
      args.dailyUrl = input.toLowerCase() === "auto" ? null : input;
    }
    else if (cur === "--from-date" && argv[i + 1]) args.fromDate = argv[++i];
    else if (cur === "--to-date" && argv[i + 1]) args.toDate = argv[++i];
    else if (cur === "--wait-ms" && argv[i + 1]) args.maxWaitMs = Number(argv[++i]) || args.maxWaitMs;
    else if (cur === "--max-results" && argv[i + 1]) args.maxResults = Number(argv[++i]) || args.maxResults;
    else if (cur === "--output" && argv[i + 1]) args.outputPath = resolve(process.cwd(), argv[++i]);
    else if (cur === "--upsert") args.upsert = true;
  }

  return args;
}

function isoTodayLisbon(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function isIsoDate(input: string | null | undefined): input is string {
  return typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input);
}

function expandIsoDateRange(fromDate: string, toDate: string): string[] {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  const out: string[] = [];

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return out;
  }

  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }

  return out;
}

async function waitForJsonResponse(page: Page, urlPart: string | string[], timeoutMs: number) {
  const urlParts = Array.isArray(urlPart) ? urlPart : [urlPart];
  try {
    return await page.waitForResponse(
      (res) => {
        const ct = (res.headers()["content-type"] ?? "").toLowerCase();
        return urlParts.some((part) => res.url().includes(part)) && ct.includes("json");
      },
      { timeout: timeoutMs },
    );
  } catch {
    return null;
  }
}

const DR_DETAIL_DATA_ENDPOINTS = [
  "/Legislacao_Conteudos/Conteudo_Detalhe/DataActionGetConteudoData",
  "/Legislacao_Conteudos/Conteudo_Detalhe/DataActionGetConteudoDataAndApplicationSettings",
];

function isDrDetailDataEndpoint(url: string): boolean {
  return DR_DETAIL_DATA_ENDPOINTS.some((part) => url.includes(part));
}

async function fetchHomeContagemHits(maxWaitMs: number): Promise<HomeContagemHit[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    locale: "pt-PT",
  });
  const page = await context.newPage();

  const responsePromise = waitForJsonResponse(page, "/Home/home/DataActionGetContagens", Math.max(3000, maxWaitMs));
  await page.goto(DR_HOME_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  const response = await responsePromise;

  let jsonOut: string | null = null;
  if (response) {
    try {
      const j = (await response.json()) as Record<string, JsonValue>;
      const data = j.data as Record<string, JsonValue> | undefined;
      const out = data?.Json_Out;
      if (typeof out === "string" && out.trim()) jsonOut = out;
    } catch {
      // Ignore malformed JSON responses.
    }
  }

  await context.close();
  await browser.close();

  if (!jsonOut) {
    throw new Error("Could not resolve DR daily URL: missing DataActionGetContagens payload.");
  }

  let parsed: Record<string, JsonValue>;
  try {
    parsed = JSON.parse(jsonOut) as Record<string, JsonValue>;
  } catch {
    throw new Error("Could not parse DR home Json_Out payload.");
  }

  const hitsObj = parsed.hits as Record<string, JsonValue> | undefined;
  const hits = hitsObj?.hits as JsonValue[] | undefined;
  if (!Array.isArray(hits) || hits.length === 0) {
    throw new Error("Could not resolve DR daily URL: empty hits list.");
  }

  const sourceList = hits
    .map((h) => {
      const hitObj = h as Record<string, JsonValue>;
      return hitObj?._source as HomeContagemSource | undefined;
    })
    .filter((s): s is HomeContagemSource => !!s);

  return sourceList
    .map((s) => ({
      dbId: String(s.dbId ?? "").trim(),
      ano: String(s.ano ?? "").trim(),
      numero: String(s.numero ?? "").trim(),
      parte: normalizeSpace(String(s.parte ?? "")),
      dataPublicacao: String(s.dataPublicacao ?? "").trim(),
    }))
    .filter((s) => !!s.dbId && !!s.ano && !!s.numero && !!s.dataPublicacao);
}

function buildDailyUrlFromParts(numero: string, ano: string, dbId: string): string {
  return `https://diariodarepublica.pt/dr/detalhe/diario-republica/${numero}-${ano}-${dbId}`;
}

function buildDailyUrlFromHit(hit: HomeContagemHit): string {
  return buildDailyUrlFromParts(hit.numero, hit.ano, hit.dbId);
}

function normalizeSearchText(value: string): string {
  return stripDiacritics(value).toLowerCase();
}

interface SearchIssueHit {
  dbId: string;
  ano: string;
  numero: string;
  dataPublicacao: string;
  title: string;
  isSerieII: boolean;
  isSupplement: boolean;
}

function parseIssueNoAndYearFromTitle(title: string): { numero: string; ano: string } | null {
  const m = title.match(/n\.?\s*[ºo]?\s*(\d+)\/(\d{4})/i);
  if (!m) return null;
  return { numero: m[1], ano: m[2] };
}

async function findDailyIssueBySearch(date: string, maxWaitMs: number): Promise<SearchIssueHit | null> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    locale: "pt-PT",
  });
  const page = await context.newPage();

  let endpoint = "";
  let csrfToken = "";
  let payloadTemplate: Record<string, unknown> | null = null;

  page.on("request", (req) => {
    if (!req.url().includes("DataActionGetPesquisas")) return;
    endpoint = req.url();
    csrfToken = req.headers()["x-csrftoken"] ?? csrfToken;
    try {
      const parsed = JSON.parse(req.postData() ?? "{}") as Record<string, unknown>;
      payloadTemplate = parsed;
    } catch {
      // Ignore malformed payload templates.
    }
  });

  await page.goto("https://diariodarepublica.pt/dr/pesquisa", {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.waitForTimeout(Math.min(Math.max(maxWaitMs, 3000), 8000));

  if (!payloadTemplate || !endpoint) {
    await context.close();
    await browser.close();
    return null;
  }

  const issues: SearchIssueHit[] = [];
  const pageSize = 25;
  let total = pageSize;

  for (let startIndex = 0; startIndex < total; startIndex += pageSize) {
    const result = await page.evaluate(async ({
      endpoint,
      csrfToken,
      payloadTemplate,
      date,
      startIndex,
      pageSize,
    }) => {
      const body = JSON.parse(JSON.stringify(payloadTemplate));
      const vars = body?.screenData?.variables ?? {};
      vars.StartIndex = startIndex;
      vars.Texto = "";
      vars.ResultadosPorPaginaId = 4;

      if (!vars.FiltrosDePesquisa) vars.FiltrosDePesquisa = {};
      vars.FiltrosDePesquisa.dataPublicacaoDe = date;
      vars.FiltrosDePesquisa.dataPublicacaoAte = date;
      vars.FiltrosDePesquisa.dataPublicacao = "";
      vars.FiltrosDePesquisa.parte = "";
      vars.FiltrosDePesquisa.numero = "";
      vars.FiltrosDePesquisa.ano = "0";
      vars.FiltrosDePesquisa.tipoConteudo = { List: [], EmptyListItem: "" };

      body.screenData.variables = vars;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/json; charset=UTF-8",
          "x-csrftoken": csrfToken,
          "outsystems-locale": "en-US",
        },
        body: JSON.stringify(body),
        credentials: "include",
      });

      if (!res.ok) {
        return { total: 0, hits: [] as Array<Record<string, unknown>> };
      }

      const payload = await res.json();
      const raw = payload?.data?.Resultado;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const total = Number(parsed?.hits?.total?.value ?? 0);
      const hits = Array.isArray(parsed?.hits?.hits)
        ? parsed.hits.hits
        : [];

      return { total, hits };
    }, {
      endpoint,
      csrfToken,
      payloadTemplate,
      date,
      startIndex,
      pageSize,
    });

    total = Math.max(total, Number(result.total ?? 0));

    const hits = Array.isArray(result.hits)
      ? result.hits
      : [];

    for (const row of hits) {
      const source = (row as Record<string, unknown>)._source as Record<string, unknown> | undefined;
      if (!source) continue;

      const className = String(source.className ?? "");
      if (!className.includes("DiarioRepublica")) continue;

      const title = normalizeSpace(String(source.title ?? ""));
      const dataPublicacao = String(source.dataPublicacao ?? "");
      const dbId = String(source.dbId ?? "").trim();

      if (!title || !dataPublicacao || !dbId) continue;
      if (dataPublicacao !== date) continue;

      const parsedNo = parseIssueNoAndYearFromTitle(title);
      const numero = String(source.numeroFonte ?? parsedNo?.numero ?? "").trim();
      const ano = String(source.ano ?? parsedNo?.ano ?? "").trim();
      if (!numero || !ano) continue;

      const normalizedTitle = normalizeSearchText(title);

      issues.push({
        dbId,
        ano,
        numero,
        dataPublicacao,
        title,
        isSerieII: /serie\s*ii/i.test(normalizedTitle),
        isSupplement: /suplemento/i.test(title),
      });
    }
  }

  await context.close();
  await browser.close();

  if (issues.length === 0) return null;

  const prefer =
    issues.find((i) => i.isSerieII && !i.isSupplement) ??
    issues.find((i) => i.isSerieII) ??
    issues.find((i) => !i.isSupplement) ??
    issues[0];

  return prefer;
}

async function resolveTodayDailyUrl(maxWaitMs: number): Promise<string> {
  const today = isoTodayLisbon();
  const hits = await fetchHomeContagemHits(maxWaitMs);

  const target = hits.find((s) => {
    const pubDate = s.dataPublicacao;
    const parte = normalizeSearchText(s.parte);
    return pubDate === today && parte.includes("contratos publicos");
  }) ?? hits.find((s) => {
    const parte = normalizeSearchText(s.parte);
    return parte.includes("contratos publicos");
  });

  if (!target) {
    const fallback = await findDailyIssueBySearch(today, maxWaitMs);
    if (!fallback) {
      throw new Error(`Could not find today's DR 'Contratos públicos' issue (date=${today}).`);
    }

    console.log(`[dr-scrape] fallback search resolved daily issue for ${today}: ${fallback.title}`);
    return buildDailyUrlFromParts(fallback.numero, fallback.ano, fallback.dbId);
  }

  return buildDailyUrlFromHit(target);
}

async function resolveDailyUrlsForDates(hits: HomeContagemHit[], dates: string[], maxWaitMs: number): Promise<string[]> {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const date of [...dates].reverse()) {
    const target = hits.find((h) => h.dataPublicacao === date && normalizeSearchText(h.parte).includes("contratos publicos"));

    if (target) {
      const url = buildDailyUrlFromHit(target);
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
      continue;
    }

    const fallback = await findDailyIssueBySearch(date, maxWaitMs);
    if (!fallback) {
      console.warn(`[dr-scrape] no DR daily issue resolved for date=${date} (home+search)`);
      continue;
    }

    const url = buildDailyUrlFromParts(fallback.numero, fallback.ano, fallback.dbId);
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    console.log(`[dr-scrape] fallback search resolved date=${date}: ${fallback.title}`);
  }

  return urls;
}

async function scrapeByDateRange(fromDate: string, toDate: string, maxWaitMs: number, maxResults: number): Promise<DrContractCandidate[]> {
  const dates = expandIsoDateRange(fromDate, toDate);
  if (dates.length === 0) return [];

  const hits = await fetchHomeContagemHits(maxWaitMs);
  const urls = await resolveDailyUrlsForDates(hits, dates, maxWaitMs);
  if (urls.length === 0) return [];

  const totalLimit = Math.max(maxResults, 1);
  const all: DrContractCandidate[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    if (all.length >= totalLimit) break;

    const remaining = totalLimit - all.length;
    const dayCandidates = await scrapeDailyContracts(url, maxWaitMs, remaining);
    for (const c of dayCandidates) {
      const key = c.dr_announcement_no ?? c.base_announcement_id ?? sha256(stableStringify(c.raw_payload));
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(c);
      if (all.length >= totalLimit) break;
    }
  }

  return all;
}

function stableStringify(input: JsonValue): string {
  if (Array.isArray(input)) {
    return `[${input.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (input && typeof input === "object") {
    const obj = input as Record<string, JsonValue>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(input);
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function mojibakeScore(value: string): number {
  return (value.match(/[ÃÂ�]|â[\u0080-\u00BF]?/g) ?? []).length;
}

function repairMojibake(value: string): string {
  let current = value;

  for (let i = 0; i < 2; i++) {
    if (!/[ÃÂâ�]/.test(current)) break;

    const repaired = Buffer.from(current, "latin1").toString("utf8");
    if (mojibakeScore(repaired) >= mojibakeScore(current)) break;

    current = repaired;
  }

  return current;
}

function normalizeSpace(v: string | null | undefined): string {
  return repairMojibake(v ?? "").replace(/\s+/g, " ").trim();
}

function mergeRawPayload(
  existingRaw: unknown,
  incomingRaw: unknown,
): JsonValue {
  const existingObj = (existingRaw && typeof existingRaw === "object")
    ? (existingRaw as Record<string, JsonValue>)
    : {};
  const incomingObj = (incomingRaw && typeof incomingRaw === "object")
    ? (incomingRaw as Record<string, JsonValue>)
    : {};

  const existingPayload = (existingObj.payload && typeof existingObj.payload === "object")
    ? (existingObj.payload as Record<string, JsonValue>)
    : {};
  const incomingPayload = (incomingObj.payload && typeof incomingObj.payload === "object")
    ? (incomingObj.payload as Record<string, JsonValue>)
    : {};

  return {
    ...existingObj,
    ...incomingObj,
    payload: {
      ...existingPayload,
      ...incomingPayload,
    },
  } as JsonValue;
}

function parsePublicationDate(text: string): string | null {
  const m = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return m ? m[1] : null;
}

function parseEmitter(blockText: string): string | null {
  const m = blockText.match(/Emitente:\s*([^\n]+)/i);
  return m ? normalizeSpace(m[1]) : null;
}

function parseDescription(blockText: string, title: string, emitter: string | null): string | null {
  const stripped = normalizeSpace(
    blockText
      .replace(title, "")
      .replace(/Emitente:.*/i, "")
      .replace(emitter ?? "", ""),
  );
  return stripped || null;
}

function isGenericDrTitle(title: string | null | undefined): boolean {
  const normalized = normalizeSpace(title ?? "").toLowerCase();
  if (!normalized) return true;
  return /^an[uú]ncio de procedimento\s+n\.?\s*[ºo]?\s*\d+\/\d{4}$/i.test(normalized);
}

function isGenericDrTitleClean(title: string | null | undefined): boolean {
  const normalized = stripDiacritics(normalizeSpace(title ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (!normalized) return true;

  return /^anuncio de procedimento\s+n\.?\s*[\u00BAo]?\s*\d+\/\d{4}$/i.test(normalized);
}

function buildEffectiveTitle(
  title: string | null | undefined,
  description: string | null | undefined,
  entityName: string | null | undefined,
): string {
  const safeTitle = normalizeSpace(title ?? "");
  const safeDescription = normalizeSpace(description ?? "");
  const safeEntity = normalizeSpace(entityName ?? "");

  if (!isGenericDrTitleClean(safeTitle)) {
    return safeTitle;
  }

  if (safeDescription) {
    return safeDescription;
  }

  if (safeEntity) {
    return `Procedimento - ${safeEntity}`;
  }

  return safeTitle || "Anuncio de procedimento";
}

function extractAnnouncementNo(texts: Array<string | null>): string | null {
  const merged = texts.filter(Boolean).join(" ");
  if (!merged) return null;

  const direct = merged.match(/\b(\d{1,6}\/\d{4})\b/);
  if (direct) return direct[1];

  const labeled = merged.match(/an[úu]ncio\s*de\s*procedimento\s*n\.?\s*[ºo]?\s*(\d{1,6}\/\d{4})/i);
  if (labeled) return labeled[1];

  return null;
}

function parsePrice(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isAnuncioProcedimentoType(tipoDiploma: string): boolean {
  const normalized = normalizeSpace(stripDiacritics(tipoDiploma))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) return false;

  return normalized.includes("anuncio") && normalized.includes("procedimento");
}

function toAbsoluteDrUrl(value: string | null | undefined): string | null {
  const raw = normalizeSpace(value ?? "");
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) return raw;

  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return new URL(path, "https://diariodarepublica.pt").toString();
}

function hasUsefulDrDetailText(text: string): boolean {
  const normalized = stripDiacritics(text);
  return (
    /Vocabulario\s+Principal\s*:\s*\d{8}(?:-\d)?/i.test(normalized) ||
    /Valor\s*do\s*preco\s*base\s*do\s*procedimento\s*:/i.test(normalized) ||
    /Preco\s*base\s*s\/IVA\s*:\s*[0-9]/i.test(normalized) ||
    /Preco\s*base\s*do\s*procedimento\s*:\s*[0-9]/i.test(normalized) ||
    /Prazo\s*para\s*apresentacao\s*das\s*propostas\s*:/i.test(normalized)
  );
}

async function waitForUsefulDrDetailText(page: Page, timeoutMs: number): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const text = document.body?.innerText ?? "";
        const normalized = text
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        return (
          /Vocabulario\s+Principal\s*:\s*\d{8}(?:-\d)?/i.test(normalized) ||
          /Valor\s*do\s*preco\s*base\s*do\s*procedimento\s*:/i.test(normalized) ||
          /Preco\s*base\s*s\/IVA\s*:\s*[0-9]/i.test(normalized) ||
          /Preco\s*base\s*do\s*procedimento\s*:\s*[0-9]/i.test(normalized) ||
          /Prazo\s*para\s*apresentacao\s*das\s*propostas\s*:/i.test(normalized)
        );
      },
      undefined,
      { timeout: timeoutMs },
    )
    .catch(() => undefined);
}

function extractNif(text: string): string | null {
  const m = text.match(/\b(?:NIPC|NIF)\s*:\s*(\d{9})\b/i);
  return m ? m[1] : null;
}

function extractCpvList(text: string): string[] {
  const normalized = stripDiacritics(text);
  const matches = Array.from(
    normalized.matchAll(/Vocabulario\s+Principal\s*:\s*(\d{8}(?:-\d)?)/gi),
  ).map((m) => m[1]);

  return [...new Set(matches.map((v) => normalizeSpace(v).toUpperCase()).filter(Boolean))];
}

function extractBasePrice(text: string): number | null {
  const normalized = stripDiacritics(text);
  const patterns = [
    /Valor\s*do\s*preco\s*base\s*do\s*procedimento\s*:\s*([0-9\.\s,]+)/i,
    /Preco\s*base\s*s\/IVA\s*:\s*([0-9\.\s,]+)/i,
    /Preco\s*base\s*do\s*procedimento\s*:\s*([0-9\.\s,]+)/i,
  ];

  for (const p of patterns) {
    const m = normalized.match(p);
    const price = parsePrice(m ? m[1] : null);
    if (price !== null) return price;
  }

  return null;
}

function extractContractType(text: string): string | null {
  const m = text.match(/Tipo\s*de\s*contrato\s*:\s*([^\r\n]+)/i);
  return m ? normalizeSpace(m[1]) : null;
}

function extractDeadlineDays(text: string): number | null {
  const normalized = stripDiacritics(text);
  const m = normalized.match(/(\d+)\s*dias\s*a\s*contar\s*do\s*termo\s*do\s*prazo\s*para\s*a\s*apresentacao\s*das\s*propostas/i);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function extractDeadlineAt(text: string): string | null {
  const normalized = stripDiacritics(text);
  const pt = normalized.match(/Prazo\s*para\s*apresentacao\s*das\s*propostas\s*:\s*(\d{2})[\/-](\d{2})[\/-](\d{4})(?:\s+(\d{2}):(\d{2}))?/i);
  if (pt) {
    const hh = pt[4] ?? "00";
    const mm = pt[5] ?? "00";
    return `${pt[3]}-${pt[2]}-${pt[1]}T${hh}:${mm}:00Z`;
  }

  const iso = normalized.match(/Prazo\s*para\s*apresentacao\s*das\s*propostas\s*:\s*(\d{4}-\d{2}-\d{2})/i);
  if (iso) return `${iso[1]}T00:00:00Z`;

  return null;
}

async function scrapeDailyContracts(dailyUrl: string, maxWaitMs: number, maxResults: number): Promise<DrContractCandidate[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "pt-PT",
  });
  const page = await context.newPage();

  let listaDoDiario: Array<Record<string, JsonValue>> = [];

  const timeoutMs = Math.max(3000, maxWaitMs);
  const normalizedDailyUrl = dailyUrl.replace(
    /(\/dr\/detalhe\/diario-republica\/\d+-\d{4}-\d+)-\d+$/i,
    "$1",
  );

  const initialResponsePromise = waitForJsonResponse(
    page,
    "/Legislacao_Conteudos/Conteudo_Det_Diario/DataActionGetDadosAndApplicationSettings",
    timeoutMs,
  );
  await page.goto(normalizedDailyUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  let response = await initialResponsePromise;

  const partSelect = page.locator("#Dropdown");
  if ((await partSelect.count()) > 0) {
    const partOptionValue = await partSelect.locator("option").evaluateAll((options) => {
      const contractsOption = options.find((option) => {
        const text = (option.textContent ?? "")
          .trim()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        return text.includes("contratos publicos");
      });
      return contractsOption?.getAttribute("value") ?? null;
    });

    const filteredResponsePromise = waitForJsonResponse(
      page,
      "/Legislacao_Conteudos/Conteudo_Det_Diario/DataActionGetDadosAndApplicationSettings",
      timeoutMs,
    );

    await partSelect.selectOption(partOptionValue ?? "7").catch(() => undefined);
    const filteredResponse = await filteredResponsePromise;
    if (filteredResponse) response = filteredResponse;
  }

  if (response) {
    try {
      const json = (await response.json()) as Record<string, JsonValue>;
      const data = json.data as Record<string, JsonValue> | undefined;
      const detalheConteudo = data?.DetalheConteudo as Record<string, JsonValue> | undefined;
      const list = detalheConteudo?.List as JsonValue[] | undefined;
      if (Array.isArray(list) && list.length > 0) {
        listaDoDiario = list.filter((x): x is Record<string, JsonValue> => typeof x === "object" && x !== null);
      }
    } catch {
      // Ignore malformed API payloads.
    }
  }

  if (listaDoDiario.length === 0) {
    const domRows = await page.locator(".diario-s1-diploma-list-container").evaluateAll((nodes) =>
      nodes.map((node) => {
        const link = node.querySelector<HTMLAnchorElement>("a[href*='/dr/detalhe/']");
        const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        const title = (link?.textContent ?? "").replace(/\s+/g, " ").trim();
        const emitterMatch = text.match(/Emitente:\s*(.+)$/i);
        const withoutTitle = title ? text.replace(title, "").trim() : text;
        const summary = emitterMatch
          ? withoutTitle.replace(/Emitente:\s*.+$/i, "").trim()
          : withoutTitle;

        return {
          Titulo: title,
          Emissor: emitterMatch?.[1]?.trim() ?? "",
          Sumario: summary,
          TipoDiploma: link?.href.match(/\/dr\/detalhe\/([^/]+)\//)?.[1] ?? "",
          Numero: title.match(/(\d{1,6}\/\d{4}(?:\/\d+)?)/)?.[1] ?? "",
          ContratoPublicoId: link?.href.split("-").pop() ?? "",
          DetailUrl: link?.href ?? "",
        };
      }),
    );

    listaDoDiario = domRows
      .filter((x) => !!x.DetailUrl)
      .map((x) => x as Record<string, JsonValue>);
  }

  const pageText = await page.locator("body").innerText();
  const publicationDate = parsePublicationDate(pageText);

  const out: DrContractCandidate[] = [];
  const seen = new Set<string>();

  if (listaDoDiario.length > 0) {
    for (const row of listaDoDiario) {
      if (out.length >= maxResults) break;

      const title = normalizeSpace(String(row.Titulo ?? ""));
      const entityName = normalizeSpace(String(row.Emissor ?? "")) || null;
      const summary = normalizeSpace(String(row.Sumario ?? "")) || null;
      const tipoDiplomaRaw = normalizeSpace(String(row.TipoDiploma ?? ""));
      const contratoId = normalizeSpace(String(row.ContratoPublicoId ?? ""));
      const drNo = normalizeSpace(String(row.Numero ?? "")) || extractAnnouncementNo([title]);

      const numeroSlug = drNo ? drNo.replace("/", "-") : "";
      const detailUrlFromRow = normalizeSpace(String(row.DetailUrl ?? row.LinkSitemap ?? ""));
      const tipoDiplomaFromUrl = detailUrlFromRow
        ? (detailUrlFromRow.match(/\/dr\/detalhe\/([^/]+)\//)?.[1] ?? "")
        : "";
      const tipoDiploma = tipoDiplomaRaw || normalizeSpace(tipoDiplomaFromUrl);
      const detailPath = !detailUrlFromRow && contratoId
        ? `/dr/detalhe/${tipoDiploma || "anuncio-procedimento"}/${numeroSlug ? `${numeroSlug}-` : ""}${contratoId}`
        : null;
      const detailUrl = toAbsoluteDrUrl(detailUrlFromRow) ?? toAbsoluteDrUrl(detailPath);

      if (!isAnuncioProcedimentoType(tipoDiploma)) {
        continue;
      }

      const candidate: DrContractCandidate = {
        base_announcement_id: contratoId || null,
        title,
        detail_url: detailUrl,
        publication_date: publicationDate,
        dr_announcement_no: drNo,
        entity_name: entityName,
        entity_nif: null,
        act_type: "Anuncio de procedimento",
        contract_type: null,
        base_price: null,
        cpv_main: null,
        cpv_list: [],
        proposal_deadline_days: null,
        proposal_deadline_at: null,
        description: summary,
        source_url: page.url(),
        raw_payload: row,
      };

      const key = candidate.dr_announcement_no ?? candidate.base_announcement_id ?? sha256(stableStringify(candidate.raw_payload));
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(candidate);
    }
  }

  await context.close();
  await browser.close();

  return out;
}

async function enrichCandidatesFromDetail(candidates: DrContractCandidate[], maxWaitMs: number): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "pt-PT",
  });

  const timeoutMs = Math.max(3000, maxWaitMs);

  let csrfToken = "";
  let payloadTemplate: Record<string, any> | null = null;
  let endpoint = "";

  const sampleUrl = candidates.find(c => c.detail_url)?.detail_url;
  if (!sampleUrl) {
    await context.close();
    await browser.close();
    return;
  }

  const warmupPage = await context.newPage();
  const reqPromise = warmupPage.waitForRequest(req => {
    if (isDrDetailDataEndpoint(req.url()) && req.method() === 'POST') {
      csrfToken = req.headers()['x-csrftoken'] ?? "";
      try {
        payloadTemplate = JSON.parse(req.postData() ?? "{}");
        endpoint = req.url();
      } catch {}
      return true;
    }
    return false;
  }, { timeout: timeoutMs }).catch(() => null);

  await warmupPage.goto(sampleUrl, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => undefined);
  await reqPromise;
  await warmupPage.close();

  if (!payloadTemplate || !endpoint) {
    console.warn("[dr-scrape] Falling back to Playwright due to missing OutSystems template.");
  }

  const CHUNK_SIZE = 20;

  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + CHUNK_SIZE);
    
    await Promise.all(chunk.map(async (item) => {
      if (!item.detail_url) return;

      let detalhe: DrDetalheConteudo | null = null;

      if (payloadTemplate && endpoint) {
        // FAST PATH: Direct fetch
        const match = item.detail_url.match(/detalhe\/([^\/]+)\/(.+)$/);
        if (match) {
          const tipo = match[1];
          const key = match[2];
          const parts = key.split('-');
          const numero = parts[0];
          const year = Number(parts[1]) || 0;
          const repId = parts[2];
          const parteId = parts[3] ?? "41";

          const body = JSON.parse(JSON.stringify(payloadTemplate));
          const vars = body.screenData?.variables ?? {};
          
          vars.ContPubId = repId;
          vars.DiarioRepId = "0"; // Reset defaults
          vars.DipLegisId = "0";
          vars.ConteudoId = repId;
          vars.Numero = numero;
          vars.Year = year;
          vars.Key = key;
          vars.Tipo = tipo;
          vars.ParteId = parteId;
          
          if (body.screenData) body.screenData.variables = vars;

          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'accept': 'application/json',
                'content-type': 'application/json; charset=UTF-8',
                'x-csrftoken': csrfToken,
              },
              body: JSON.stringify(body)
            });

            if (res.ok) {
              const j = await res.json() as any;
              if (j?.data?.DetalheConteudo) {
                 detalhe = j.data.DetalheConteudo;
              }
            }
          } catch (e) {
            // Drop to fallback
          }
        }
      }

      if (!detalhe || !hasUsefulDrDetailText(String(detalhe["Texto"] ?? ""))) {
        // SLOW PATH: Playwright fallback. Some direct DR payloads have summary
        // metadata but miss the rich "Texto" block with CPV, price and deadlines.
        const page = await context.newPage();
        const responsePromise = waitForJsonResponse(
          page,
          DR_DETAIL_DATA_ENDPOINTS,
          timeoutMs,
        );

        await page.goto(item.detail_url, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => undefined);
        await waitForUsefulDrDetailText(page, timeoutMs);

        let fallbackDetalhe: DrDetalheConteudo | null = null;
        const res = await responsePromise;

        if (res) {
          try {
            const j = (await res.json()) as Record<string, JsonValue>;
            const data = j.data as Record<string, JsonValue> | undefined;
            const det = data?.DetalheConteudo as DrDetalheConteudo | undefined;
            if (det) fallbackDetalhe = det;
          } catch {
            // Ignore malformed payloads.
          }
        }

        if (fallbackDetalhe && hasUsefulDrDetailText(String(fallbackDetalhe["Texto"] ?? ""))) {
          detalhe = {
            ...(detalhe ?? {}),
            ...fallbackDetalhe,
          };
        } else {
          const visibleText = await page.locator("body").innerText().catch(() => "");
          if (visibleText.trim()) {
            detalhe = {
              Id: fallbackDetalhe?.["Id"] ?? detalhe?.["Id"] ?? item.base_announcement_id,
              Numero: fallbackDetalhe?.["Numero"] ?? detalhe?.["Numero"] ?? item.dr_announcement_no,
              Sumario: fallbackDetalhe?.["Sumario"] ?? detalhe?.["Sumario"] ?? item.description,
              Texto: visibleText,
              DataPublicacao:
                fallbackDetalhe?.["DataPublicacao"] ??
                detalhe?.["DataPublicacao"] ??
                parsePublicationDate(visibleText),
            };
          }
        }

        await page.close();
      }

      if (detalhe) {
        const texto = String(detalhe["Texto"] ?? "");
        const sumario = normalizeSpace(String(detalhe["Sumario"] ?? ""));

        item.base_announcement_id = detalhe["Id"] ? String(detalhe["Id"]) : item.base_announcement_id;
        item.dr_announcement_no = detalhe["Numero"] ? String(detalhe["Numero"]) : item.dr_announcement_no;
        item.publication_date = typeof detalhe["DataPublicacao"] === "string" ? detalhe["DataPublicacao"].trim() : item.publication_date;
        item.description = sumario || item.description;
        item.entity_nif = extractNif(texto) ?? item.entity_nif;
        item.contract_type = extractContractType(texto) ?? item.contract_type;
        item.base_price = extractBasePrice(texto) ?? item.base_price;
        const extractedCpvs = extractCpvList(texto);
        if (extractedCpvs.length > 0) {
          item.cpv_list = extractedCpvs;
          item.cpv_main = extractedCpvs[0] ?? item.cpv_main;
        }
        item.proposal_deadline_days = extractDeadlineDays(texto) ?? item.proposal_deadline_days;
        item.proposal_deadline_at = extractDeadlineAt(texto) ?? item.proposal_deadline_at;
        item.raw_payload = {
          ...(item.raw_payload as Record<string, JsonValue>),
          detalhe_conteudo: detalhe as JsonValue,
        };
      }
    }));
  }

  await context.close();
  await browser.close();
}

function hasMeaningfulAnnouncementValue(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function announcementRowCompletenessScore(row: Record<string, any>): number {
  let score = 0;
  for (const key of [
    "base_price",
    "cpv_main",
    "proposal_deadline_at",
    "entity_nif",
    "contract_type",
    "detail_url",
    "description",
  ]) {
    if (hasMeaningfulAnnouncementValue(row[key])) score += 1;
  }

  if (Array.isArray(row.cpv_list)) {
    score += Math.min(row.cpv_list.length, 3);
  }

  return score;
}

function dedupeAnnouncementRowsByField(
  rows: Array<Record<string, any>>,
  field: "base_announcement_id" | "dr_announcement_no",
): Array<Record<string, any>> {
  const withoutValue: Array<Record<string, any>> = [];
  const byValue = new Map<string, Record<string, any>>();

  for (const row of rows) {
    const value = normalizeSpace(String(row[field] ?? ""));
    if (!value) {
      withoutValue.push(row);
      continue;
    }

    row[field] = value;

    const existing = byValue.get(value);
    if (!existing || announcementRowCompletenessScore(row) >= announcementRowCompletenessScore(existing)) {
      byValue.set(value, row);
    }
  }

  return [...withoutValue, ...byValue.values()];
}

function dedupeAnnouncementRows(rows: Array<Record<string, any>>): Array<Record<string, any>> {
  return dedupeAnnouncementRowsByField(
    dedupeAnnouncementRowsByField(rows, "base_announcement_id"),
    "dr_announcement_no",
  );
}

async function upsertIntoSupabase(candidates: DrContractCandidate[]): Promise<{ inserted: number; updated: number; skipped: number }> {
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let tenantId = process.env.TENANT_ID ?? "";

  if (!tenantId) {
    const { data: tenant, error } = await supabase
      .from("tenants")
      .select("id")
      .limit(1)
      .single();

    if (error || !tenant) {
      throw new Error("No tenant found. Run admin-seed first or set TENANT_ID in .env.");
    }

    tenantId = tenant.id;
  }

  const cpvCatalogCache = new Map<string, Promise<string | null>>();

  async function resolveCanonicalCpv(raw: string | null | undefined): Promise<string | null> {
    const value = normalizeSpace(raw ?? "").toUpperCase();
    if (!value || value === "-" || value === "—") return null;

    const match = value.match(/\b(\d{8})(?:-(\d))?\b/);
    if (!match) return null;

    const core8 = match[1];
    
    // If there is an ongoing or completed query for this core8, wait for it.
    if (cpvCatalogCache.has(core8)) {
      return cpvCatalogCache.get(core8) ?? null;
    }

    const fetchTask = (async () => {
      try {
        const { data, error } = await supabase
          .from("cpv_codes")
          .select("id")
          .ilike("id", `${core8}-%`)
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.warn(`[dr-scrape] Warning: CPV catalog lookup failed for ${core8}: ${error.message}`);
          return match[2] ? `${core8}-${match[2]}` : core8;
        }

        const canonical = data?.id ? String(data.id) : null;
        const fallback = match[2] ? `${core8}-${match[2]}` : core8;
        return canonical ?? fallback;
      } catch (err) {
        console.warn(`[dr-scrape] Warning: CPV network fetch failed for ${core8}: ${err instanceof Error ? err.message : String(err)}`);
        return match[2] ? `${core8}-${match[2]}` : core8;
      }
    })();

    cpvCatalogCache.set(core8, fetchTask);
    return fetchTask;
  }

  const rows: any[] = [];
  const DB_CHUNK_SIZE = 50;

  for (let i = 0; i < candidates.length; i += DB_CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + DB_CHUNK_SIZE);
    
    const chunkRows = await Promise.all(chunk.map(async (c) => {
      const canonicalMain = await resolveCanonicalCpv(c.cpv_main);
      const canonicalList = Array.from(
        new Set(
          (await Promise.all((c.cpv_list ?? []).map((code) => resolveCanonicalCpv(code))))
            .filter((code): code is string => Boolean(code)),
        ),
      );

      const cpvMain = canonicalMain ?? canonicalList[0] ?? null;

      const raw = {
        source_url: c.source_url,
        scraped_at: new Date().toISOString(),
        payload: c.raw_payload,
      } as JsonValue;

      const rawHash = sha256(stableStringify(raw));
      const effectiveTitle = buildEffectiveTitle(c.title, c.description, c.entity_name);
      const drAnnouncementNo = normalizeSpace(c.dr_announcement_no ?? "");

      return {
        tenant_id: tenantId,
        source: "DR_SCRAPE",
        base_announcement_id: c.base_announcement_id,
        dr_announcement_no: drAnnouncementNo || null,
        publication_date: c.publication_date ?? new Date().toISOString().slice(0, 10),
        title: effectiveTitle,
        description: c.description,
        entity_name: c.entity_name,
        entity_nif: c.entity_nif,
        procedure_type: "Anuncio de procedimento",
        act_type: c.act_type,
        contract_type: c.contract_type,
        base_price: c.base_price,
        currency: "EUR",
        cpv_main: cpvMain,
        cpv_list: canonicalList,
        proposal_deadline_days: c.proposal_deadline_days,
        proposal_deadline_at: c.proposal_deadline_at,
        detail_url: c.detail_url,
        raw_payload: raw,
        raw_hash: rawHash,
        status: "active",
      };
    }));
    
    rows.push(...chunkRows);
  }

  const uniqueRows = dedupeAnnouncementRows(rows);
  const duplicateRowsSkipped = rows.length - uniqueRows.length;
  if (duplicateRowsSkipped > 0) {
    console.warn(`[dr-scrape] skipped ${duplicateRowsSkipped} duplicate DR candidate(s) before upsert`);
  }

  const drNos = Array.from(new Set(uniqueRows
    .map((r) => r.dr_announcement_no)
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)));
  const baseIds = Array.from(new Set(uniqueRows
    .map((r) => r.base_announcement_id)
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)));

  const existingByDrNo = new Set<string>();
  const EXISTING_LOOKUP_CHUNK_SIZE = 100;
  for (let i = 0; i < drNos.length; i += EXISTING_LOOKUP_CHUNK_SIZE) {
    const chunk = drNos.slice(i, i + EXISTING_LOOKUP_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("announcements")
      .select("dr_announcement_no")
      .eq("tenant_id", tenantId)
      .in("dr_announcement_no", chunk);

    if (error) {
      throw new Error(`Failed loading existing DR announcements: ${error.message}`);
    }

    for (const row of data ?? []) {
      const drNo = normalizeSpace(String(row.dr_announcement_no ?? ""));
      if (drNo) existingByDrNo.add(drNo);
    }
  }

  const existingByBaseId = new Set<string>();
  for (let i = 0; i < baseIds.length; i += EXISTING_LOOKUP_CHUNK_SIZE) {
    const chunk = baseIds.slice(i, i + EXISTING_LOOKUP_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("announcements")
      .select("base_announcement_id")
      .eq("tenant_id", tenantId)
      .in("base_announcement_id", chunk);

    if (error) {
      throw new Error(`Failed loading existing base announcements: ${error.message}`);
    }

    for (const row of data ?? []) {
      const baseId = normalizeSpace(String(row.base_announcement_id ?? ""));
      if (baseId) existingByBaseId.add(baseId);
    }
  }

  const toInsert = uniqueRows.filter((r) => {
    const hasExistingDrNo = !!r.dr_announcement_no && existingByDrNo.has(r.dr_announcement_no);
    const hasExistingBaseId = !!r.base_announcement_id && existingByBaseId.has(r.base_announcement_id);
    return !hasExistingDrNo && !hasExistingBaseId;
  });
  const toUpdate = uniqueRows.filter((r) => {
    const hasExistingDrNo = !!r.dr_announcement_no && existingByDrNo.has(r.dr_announcement_no);
    const hasExistingBaseId = !!r.base_announcement_id && existingByBaseId.has(r.base_announcement_id);
    return hasExistingDrNo || hasExistingBaseId;
  });

  if (toInsert.length > 0) {
    const { error } = await supabase.from("announcements").insert(toInsert);
    if (error) throw new Error(`Insert failed: ${error.message}`);
  }

  const UPDATE_CHUNK_SIZE = 10;
  for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = toUpdate.slice(i, i + UPDATE_CHUNK_SIZE);
    
    await Promise.all(chunk.map(async (row) => {
      const { raw_hash, tenant_id, dr_announcement_no, ...incoming } = row;
      const baseAnnouncementId = normalizeSpace(String(incoming.base_announcement_id ?? ""));

      let existingQuery = supabase
        .from("announcements")
        .select(
          "source, publication_date, title, description, entity_nif, contract_type, base_price, cpv_main, cpv_list, proposal_deadline_days, proposal_deadline_at, detail_url, raw_payload",
        )
        .eq("tenant_id", tenant_id);

      if (baseAnnouncementId) {
        existingQuery = existingQuery.eq("base_announcement_id", baseAnnouncementId);
      } else {
        existingQuery = existingQuery.eq("dr_announcement_no", dr_announcement_no as string);
      }

      const { data: existing, error: fetchErr } = await existingQuery.maybeSingle();

      if (fetchErr) throw new Error(`Fetch existing failed for DR ${dr_announcement_no ?? baseAnnouncementId}: ${fetchErr.message}`);

      const existingCanonicalCpv = await resolveCanonicalCpv(
        typeof existing?.cpv_main === "string" ? existing.cpv_main : null,
      );
      const hasExistingCpv = !!existingCanonicalCpv;

      const incomingTitle = buildEffectiveTitle(incoming.title, incoming.description, incoming.entity_name);
      const existingTitle = normalizeSpace(existing?.title ?? "");
      const keepExistingTitle =
        !!existingTitle &&
        existing?.source === "BASE_API";

      const updateFields = {
        // Keep canonical source (usually BASE_API) when it already exists.
        source: existing?.source ?? incoming.source,
        publication_date: existing?.source === "BASE_API" ? existing?.publication_date : incoming.publication_date,
        // Preserve richer canonical fields from BASE ingest when present.
        title: keepExistingTitle ? existing?.title : incomingTitle,
        description: existing?.description ?? incoming.description,
        contract_type: existing?.contract_type ?? incoming.contract_type,
        base_price: existing?.base_price ?? incoming.base_price,
        cpv_main: hasExistingCpv ? existing?.cpv_main : incoming.cpv_main,
        cpv_list: hasExistingCpv ? existing?.cpv_list : incoming.cpv_list,
        proposal_deadline_days: existing?.proposal_deadline_days ?? incoming.proposal_deadline_days,
        proposal_deadline_at: existing?.proposal_deadline_at ?? incoming.proposal_deadline_at,
        detail_url: existing?.detail_url ?? incoming.detail_url,
        // Useful enrichment fields from DR details.
        entity_nif: existing?.entity_nif ?? incoming.entity_nif,
        raw_payload: mergeRawPayload(existing?.raw_payload, incoming.raw_payload),
        raw_hash,
      };

      const { error } = await supabase
        .from("announcements")
        .update(updateFields)
        .eq("tenant_id", tenant_id)
        .eq("dr_announcement_no", dr_announcement_no as string);

      if (error) throw new Error(`Update failed for DR ${dr_announcement_no}: ${error.message}`);
    }));
  }

  const currentDrNos = new Set(
    uniqueRows
      .map((r) => r.dr_announcement_no)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim()),
  );

  const publicationDates = Array.from(
    new Set(
      uniqueRows
        .map((r) => r.publication_date)
        .filter((v): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)),
    ),
  );

  if (publicationDates.length > 0) {
    const { data: dateRows, error: dateRowsErr } = await supabase
      .from("announcements")
      .select("id, dr_announcement_no, cpv_main")
      .eq("tenant_id", tenantId)
      .eq("source", "DR_SCRAPE")
      .in("publication_date", publicationDates);

    if (dateRowsErr) {
      throw new Error(`Failed loading DR rows for stale cleanup: ${dateRowsErr.message}`);
    }

    const staleIds = (dateRows ?? [])
      .filter((row) => {
        const drNo = String(row.dr_announcement_no ?? "").trim();
        const cpv = String(row.cpv_main ?? "").trim();
        const hasValidCpv = /\b\d{8}(?:-\d)?\b/.test(cpv);
        return !hasValidCpv && !!drNo && !currentDrNos.has(drNo);
      })
      .map((row) => String(row.id))
      .filter(Boolean);

    for (let i = 0; i < staleIds.length; i += 200) {
      const chunk = staleIds.slice(i, i + 200);
      const { error: deleteErr } = await supabase
        .from("announcements")
        .delete()
        .eq("tenant_id", tenantId)
        .in("id", chunk);

      if (deleteErr) {
        throw new Error(`Failed deleting stale DR rows: ${deleteErr.message}`);
      }
    }
  }

  return {
    inserted: toInsert.length,
    updated: toUpdate.length,
    skipped: duplicateRowsSkipped + uniqueRows.length - toInsert.length - toUpdate.length,
  };
}

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  loadDotenv({ path: resolve(__dirname, "../.env") });

  const args = parseArgs(process.argv.slice(2));

  const fromDate = isIsoDate(args.fromDate) ? args.fromDate : null;
  const toDate = isIsoDate(args.toDate) ? args.toDate : null;

  let candidates: DrContractCandidate[] = [];

  if (fromDate && toDate && !args.dailyUrl) {
    console.log(`[dr-scrape] from_date=${fromDate} to_date=${toDate} wait_ms=${args.maxWaitMs} max_results=${args.maxResults} upsert=${args.upsert}`);
    candidates = await scrapeByDateRange(fromDate, toDate, args.maxWaitMs, args.maxResults);
  } else {
    const dailyUrl = args.dailyUrl || await resolveTodayDailyUrl(args.maxWaitMs);
    console.log(`[dr-scrape] daily_url=${dailyUrl} wait_ms=${args.maxWaitMs} max_results=${args.maxResults} upsert=${args.upsert}`);

    candidates = await scrapeDailyContracts(dailyUrl, args.maxWaitMs, args.maxResults);
    if (candidates.length === 0) {
      const retryWait = Math.max(args.maxWaitMs, 25000);
      console.log(`[dr-scrape] empty result, retrying with wait_ms=${retryWait}`);
      candidates = await scrapeDailyContracts(dailyUrl, retryWait, args.maxResults);
    }
  }

  if (candidates.length > 0) {
    await enrichCandidatesFromDetail(candidates, args.maxWaitMs);
  }

  console.log(`[dr-scrape] normalized candidates: ${candidates.length}`);

  const rawOutputPath = args.outputPath.replace(/\.json$/i, ".raw.json");
  await mkdir(dirname(rawOutputPath), { recursive: true });
  await writeFile(rawOutputPath, JSON.stringify(candidates, null, 2), "utf8");
  console.log(`[dr-scrape] wrote raw payloads: ${rawOutputPath}`);

  await mkdir(dirname(args.outputPath), { recursive: true });
  await writeFile(args.outputPath, JSON.stringify(candidates, null, 2), "utf8");
  console.log(`[dr-scrape] wrote: ${args.outputPath}`);

  if (args.upsert) {
    const stats = await upsertIntoSupabase(candidates);
    console.log(`[dr-scrape] inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped}`);
  }
}

main().catch((err) => {
  console.error("[dr-scrape] fatal:", err);
  process.exit(1);
});
