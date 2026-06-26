/**
 * Email provider abstraction.
 *
 * Supported providers (EMAIL_PROVIDER env var):
 *   "dev"       → logs to console (default for local development)
 *   "mailpit"   → sends via Mailpit SMTP-over-HTTP (local Supabase)
 *   "sendgrid"  → SendGrid HTTP API
 *   "brevo"     → Brevo HTTP API
 *
 * For production: set EMAIL_PROVIDER=brevo and BREVO_API_KEY.
 * If EMAIL_PROVIDER is omitted but BREVO_API_KEY exists, Brevo is used.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ name: string; content: string; contentType?: string }>;
}

export interface SendResult {
  success: boolean;
  error?: string;
  provider?: string;
  messageId?: string;
  details?: unknown;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<SendResult>;
}

// ---------------------------------------------------------------------------
// Dev / console provider
// ---------------------------------------------------------------------------

class ConsoleEmailProvider implements EmailProvider {
  async send(msg: EmailMessage): Promise<SendResult> {
    console.log("─────────────────────────────────────────");
    console.log(`[DEV EMAIL] To      : ${msg.to}`);
    console.log(`[DEV EMAIL] Subject : ${msg.subject}`);
    console.log(`[DEV EMAIL] Body    :\n${msg.text ?? msg.html}`);
    if (msg.attachments && msg.attachments.length > 0) {
      console.log(`[DEV EMAIL] Attachments: ${msg.attachments.map(a => a.name).join(', ')}`);
    }
    console.log("─────────────────────────────────────────");
    return { success: true };
  }
}

// ---------------------------------------------------------------------------
// Mailpit provider (local Supabase – http://127.0.0.1:55324)
// Mailpit exposes a REST API at /api/v1/send (v1.20+)
// ---------------------------------------------------------------------------

class MailpitEmailProvider implements EmailProvider {
  private apiUrl: string;
  private from: string;

  constructor() {
    this.apiUrl = Deno.env.get("MAILPIT_URL") ?? "http://127.0.0.1:55324";
    this.from = Deno.env.get("EMAIL_FROM") ?? Deno.env.get("MAIL_FROM") ?? "noreply@localhost";
  }

  async send(msg: EmailMessage): Promise<SendResult> {
    try {
      const body = {
        From: { Email: this.from, Name: "BASE Monitor" },
        To: [{ Email: msg.to }],
        Subject: msg.subject,
        HTML: msg.html,
        Text: msg.text ?? "",
        ...(msg.attachments && msg.attachments.length > 0 ? { Attachments: msg.attachments.map(a => ({ Name: a.name, Content: a.content })) } : {}),
      };

      const res = await fetch(`${this.apiUrl}/api/v1/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        console.warn(`[Mailpit] send failed (${res.status}): ${err} – falling back to console`);
        // Fallback: just log
        console.log(`[Mailpit-fallback] To: ${msg.to} | Subject: ${msg.subject}`);
        return { success: true }; // treat as success in dev
      }

      console.log(`[Mailpit] Email sent to ${msg.to}: ${msg.subject}`);
      return { success: true };
    } catch (err) {
      // Mailpit not reachable – log and continue
      console.warn(`[Mailpit] unreachable (${err}) – logging email`);
      console.log(`[EMAIL] To: ${msg.to} | Subject: ${msg.subject}`);
      return { success: true };
    }
  }
}

// ---------------------------------------------------------------------------
// SendGrid provider
// ---------------------------------------------------------------------------

class SendGridEmailProvider implements EmailProvider {
  private apiKey: string;
  private from: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.from = Deno.env.get("EMAIL_FROM") ?? Deno.env.get("MAIL_FROM") ?? "noreply@example.com";
  }

  async send(msg: EmailMessage): Promise<SendResult> {
    const body = {
      personalizations: [{ to: [{ email: msg.to }] }],
      from: { email: this.from, name: "BASE Monitor" },
      subject: msg.subject,
      content: [
        { type: "text/html", value: msg.html },
        ...(msg.text ? [{ type: "text/plain", value: msg.text }] : []),
      ],
      ...(msg.attachments && msg.attachments.length > 0 ? { attachments: msg.attachments.map(a => ({ content: a.content, filename: a.name, type: a.contentType ?? "application/octet-stream", disposition: "attachment" })) } : {}),
    };

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      return { success: false, error: `SendGrid ${res.status}: ${error}` };
    }

    return { success: true };
  }
}

// ---------------------------------------------------------------------------
// Brevo provider
// ---------------------------------------------------------------------------

class BrevoEmailProvider implements EmailProvider {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.fromEmail = Deno.env.get("EMAIL_FROM") ?? Deno.env.get("MAIL_FROM") ?? "noreply@example.com";
    this.fromName = Deno.env.get("EMAIL_FROM_NAME") ?? "BASE Monitor";
  }

  async send(msg: EmailMessage): Promise<SendResult> {
    const payload = {
      sender: {
        name: this.fromName,
        email: this.fromEmail,
      },
      to: [{ email: msg.to }],
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text ?? msg.html,
      ...(msg.attachments && msg.attachments.length > 0 ? { attachment: msg.attachments.map(a => ({ content: a.content, name: a.name, contentType: a.contentType ?? "application/pdf" })) } : {}),
    };

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    let details: unknown = responseText;
    try {
      details = responseText ? JSON.parse(responseText) : null;
    } catch {
      details = responseText;
    }

    if (!res.ok) {
      return { success: false, provider: "brevo", error: `Brevo ${res.status}: ${responseText}`, details };
    }

    const messageId = details && typeof details === "object" && "messageId" in details
      ? String((details as { messageId?: unknown }).messageId ?? "")
      : undefined;
    console.log(`[Brevo] accepted email to ${msg.to}${messageId ? ` messageId=${messageId}` : ""}`);
    return { success: true, provider: "brevo", messageId, details };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEmailProvider(): EmailProvider {
  const explicitProvider = Deno.env.get("EMAIL_PROVIDER");
  const provider = (explicitProvider ?? (Deno.env.get("BREVO_API_KEY") ? "brevo" : "dev")).toLowerCase();
  console.log(`[email] provider=${provider}`);

  switch (provider) {
    case "brevo": {
      const key = Deno.env.get("BREVO_API_KEY");
      if (!key) throw new Error("EMAIL_PROVIDER=brevo but BREVO_API_KEY is not set");
      return new BrevoEmailProvider(key);
    }
    case "sendgrid": {
      const key = Deno.env.get("SENDGRID_API_KEY");
      if (!key) throw new Error("EMAIL_PROVIDER=sendgrid but SENDGRID_API_KEY is not set");
      return new SendGridEmailProvider(key);
    }
    case "mailpit":
      return new MailpitEmailProvider();
    default:
      return new ConsoleEmailProvider();
  }
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

type SectionRow = { label: string; value: string };
type EmailSection = { title: string; rows: SectionRow[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (value instanceof Date) return value.toLocaleString("pt-PT");
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("pt-PT") : "-";
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    if (value.every((item) => item == null || ["string", "number", "boolean"].includes(typeof item))) {
      return value.map((item) => String(item)).join(", ");
    }
    return `${value.length} item(s)`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  const normalized = String(value).trim();
  return normalized || "-";
}

function collectRows(value: unknown, prefix = ""): SectionRow[] {
  if (!isPlainObject(value)) return [];

  const rows: SectionRow[] = [];
  for (const [key, child] of Object.entries(value)) {
    const label = prefix ? `${prefix} / ${formatLabel(key)}` : formatLabel(key);
    if (child == null || child === "") {
      rows.push({ label, value: "-" });
      continue;
    }

    if (Array.isArray(child)) {
      if (child.length === 0) {
        rows.push({ label, value: "-" });
        continue;
      }

      if (child.every((item) => item == null || ["string", "number", "boolean"].includes(typeof item))) {
        rows.push({ label, value: child.map((item) => String(item)).join(", ") });
        continue;
      }

      child.forEach((item, index) => {
        if (isPlainObject(item)) {
          rows.push(...collectRows(item, `${label} #${index + 1}`));
        } else {
          rows.push({ label: `${label} #${index + 1}`, value: formatValue(item) });
        }
      });
      continue;
    }

    if (isPlainObject(child)) {
      rows.push(...collectRows(child, label));
      continue;
    }

    rows.push({ label, value: formatValue(child) });
  }

  return rows;
}

function safeDate(value: unknown, dateOnly = false): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return dateOnly
    ? date.toLocaleDateString("pt-PT")
    : date.toLocaleString("pt-PT");
}

function buildAnnouncementSections(announcement: Record<string, unknown>): EmailSection[] {
  const rawPayload = isPlainObject(announcement.raw_payload) ? announcement.raw_payload : null;
  const payload = rawPayload && isPlainObject(rawPayload.payload)
    ? rawPayload.payload
    : rawPayload;

  const topRows: SectionRow[] = [
    ["ID", announcement.id],
    ["Base ID", announcement.base_announcement_id],
    ["Nº DR", announcement.dr_announcement_no],
    ["Título", announcement.title],
    ["Entidade", announcement.entity_name],
    ["NIPC", announcement.entity_nif],
    ["Data de publicação", announcement.publication_date],
    ["CPV principal", announcement.cpv_main],
    ["Preço base", announcement.base_price != null ? `${Number(announcement.base_price).toLocaleString("pt-PT")} ${announcement.currency ?? "EUR"}` : null],
    ["Moeda", announcement.currency],
    ["Tipo de procedimento", announcement.procedure_type],
    ["Tipo de contrato", announcement.contract_type],
    ["Estado", announcement.status ?? announcement.effective_status],
    ["Fonte", announcement.source],
    ["URL do anúncio", announcement.detail_url],
    ["Prazo propostas", announcement.proposal_deadline_at ? safeDate(announcement.proposal_deadline_at) : null],
    ["Atualizado em", announcement.updated_at ? safeDate(announcement.updated_at) : null],
    ["Criado em", announcement.created_at ? safeDate(announcement.created_at) : null],
  ].map(([label, value]) => ({ label: String(label), value: formatValue(value) }));

  const sections: EmailSection[] = [
    {
      title: "Resumo do anúncio",
      rows: topRows,
    },
  ];

  if (isPlainObject(payload)) {
    const groupedEntries = Object.entries(payload).flatMap(([groupKey, groupValue]) => {
      const title = formatLabel(groupKey);
      if (groupValue == null || groupValue === "") {
        return [{ title, rows: [{ label: title, value: "-" }] }];
      }

      if (isPlainObject(groupValue)) {
        const rows = collectRows(groupValue);
        return rows.length > 0 ? [{ title, rows }] : [{ title, rows: [{ label: title, value: "-" }] }];
      }

      if (Array.isArray(groupValue)) {
        const rows = collectRows({ [groupKey]: groupValue }).slice(0, 200);
        return rows.length > 0 ? [{ title, rows }] : [{ title, rows: [{ label: title, value: "-" }] }];
      }

      return [{ title, rows: [{ label: title, value: formatValue(groupValue) }] }];
    });

    sections.push(...groupedEntries);
  }

  if (isPlainObject(rawPayload) && rawPayload !== payload) {
    const extraRows = collectRows(rawPayload).filter((row) => row.label !== "Payload");
    if (extraRows.length > 0) {
      sections.push({ title: "Raw payload", rows: extraRows });
    }
  }

  return sections;
}

function escapeEmailHtml(value: unknown): string {
  return formatValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanEmailText(value: unknown): string {
  return formatValue(value)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function firstEmailText(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanEmailText(value);
    if (text && text !== "-") return text;
  }
  return "-";
}

function normalizeEmailPayloadKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findEmailPayloadValueRecursive(
  node: unknown,
  wantedKeys: Set<string>,
  depth = 0,
): unknown {
  if (!node || depth > 5) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findEmailPayloadValueRecursive(item, wantedKeys, depth + 1);
      if (found != null && found !== "") return found;
    }
    return null;
  }

  if (!isPlainObject(node)) return null;

  for (const [rawKey, value] of Object.entries(node)) {
    const key = normalizeEmailPayloadKey(rawKey);
    if (wantedKeys.has(key) && value != null && value !== "") return value;
  }

  for (const value of Object.values(node)) {
    const found = findEmailPayloadValueRecursive(value, wantedKeys, depth + 1);
    if (found != null && found !== "") return found;
  }

  return null;
}

function pickEmailPayloadValue(payload: Record<string, unknown> | null, keys: string[]): unknown {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    if (value != null && value !== "") return value;
  }

  const normalizedKeys = new Set(keys.map(normalizeEmailPayloadKey));
  return findEmailPayloadValueRecursive(payload, normalizedKeys);
}

function extractEmailLabeledValue(text: unknown, labels: string[]): string | null {
  if (typeof text !== "string" || !text.trim()) return null;

  for (const label of labels) {
    const re = new RegExp(`${label}\\s*:?\\s*([^\\r\\n]+)`, "i");
    const match = text.match(re);
    if (!match) continue;

    const value = match[1]?.replace(/^Principal\s*:\s*/i, "").trim();
    if (value) return value;
  }

  return null;
}

function formatEmailPrice(value: number | null | undefined, currency = "EUR"): string {
  if (value == null || !Number.isFinite(Number(value))) return "Nao especificado";
  return `${Number(value).toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatEmailDeadlineDays(deadlineAt: unknown): { text: string; daysRemaining: number; color: "green" | "yellow" | "red" } {
  if (!deadlineAt) return { text: "-", daysRemaining: 0, color: "red" };
  const deadline = new Date(String(deadlineAt));
  if (Number.isNaN(deadline.getTime())) return { text: "-", daysRemaining: 0, color: "red" };
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const end = Date.UTC(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const days = Math.ceil((end - start) / 86400000);
  
  let text = "";
  if (days < 0) text = "Prazo terminado";
  else if (days === 0) text = "Termina hoje";
  else if (days === 1) text = "1 dia restante";
  else text = `${days} dias restantes`;
  
  let color: "green" | "yellow" | "red" = "red";
  if (days >= 15) color = "green";
  else if (days >= 7) color = "yellow";
  
  return { text, daysRemaining: days, color };
}

function formatEmailCpv(
  announcement: Record<string, unknown> | undefined,
  cpvMain?: string | null,
  payload: Record<string, unknown> | null = null,
): string {
  const code = firstEmailText(cpvMain, announcement?.cpv_main);
  const cpvList = announcement?.cpv_list;
  const cpvFromPayload = pickEmailPayloadValue(payload, [
    "descricaoCpv",
    "descricaoCPV",
    "cpvDescricao",
    "cpvDescription",
    "descricaoCpvPrincipal",
    "descricaoCodigoCpv",
  ]);
  const topLevelDescription = firstEmailText(
    announcement?.cpv_description,
    announcement?.cpv_main_description,
    announcement?.cpv_desc,
    cpvFromPayload,
  );

  if (topLevelDescription !== "-") {
    return code !== "-" ? `${code} - ${topLevelDescription}` : topLevelDescription;
  }

  if (Array.isArray(cpvList)) {
    const match = cpvList.find((item) => {
      if (isPlainObject(item)) return String(item.code ?? item.id ?? "") === code;
      return String(item) === code;
    });
    if (isPlainObject(match)) {
      const description = firstEmailText(match.description, match.descricao);
      return description !== "-" ? `${code} - ${description}` : code;
    }
  }
  return code;
}

function toTitleCasePt(value: string): string {
  const minor = new Set([
    "de", "da", "do", "dos", "das", "e", "a", "o", "as", "os",
    "para", "com", "em", "no", "na", "nos", "nas", "por", "ao", "aos", "à", "às",
  ]);
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) =>
      index > 0 && minor.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function buildAnnouncementEmailLegacy(params: {
  clientName: string;
  title: string;
  entityName?: string | null;
  publicationDate?: string | null;
  cpvMain?: string | null;
  basePrice?: number | null;
  currency?: string;
  detailUrl?: string | null;
  appBaseUrl: string;
  announcement?: Record<string, unknown>;
}): { subject: string; html: string; text: string } {
  return buildAnnouncementEmail(params);
}

export function buildAnnouncementEmail(params: {
  clientName: string;
  title: string;
  entityName?: string | null;
  publicationDate?: string | null;
  cpvMain?: string | null;
  basePrice?: number | null;
  currency?: string;
  detailUrl?: string | null;
  appBaseUrl: string;
  announcement?: Record<string, unknown>;
}): { subject: string; html: string; text: string } {
  const {
    title,
    entityName,
    publicationDate,
    cpvMain,
    basePrice,
    currency,
    detailUrl,
    appBaseUrl,
    announcement,
  } = params;

  const rawPayload = isPlainObject(announcement?.raw_payload) ? announcement.raw_payload : null;
  const payload = rawPayload && isPlainObject(rawPayload.payload)
    ? rawPayload.payload
    : rawPayload;
  const detailText = (
    isPlainObject(payload?.detalhe_conteudo) && typeof payload.detalhe_conteudo.Texto === "string"
      ? payload.detalhe_conteudo.Texto
      : null
  ) ?? (
    isPlainObject(payload?.detalhe_conteudo) && typeof payload.detalhe_conteudo.TextoFormatado === "string"
      ? payload.detalhe_conteudo.TextoFormatado
      : null
  );

  const priceStr = formatEmailPrice(basePrice, currency ?? "EUR");
  const deadlineAt = announcement?.proposal_deadline_at;
  const deadlineStr = deadlineAt
    ? safeDate(deadlineAt, true)
    : firstEmailText(
      announcement?.proposal_deadline_days != null ? `${announcement.proposal_deadline_days} dias` : null,
      pickEmailPayloadValue(payload, ["prazoApresentacaoPropostas", "Prazo para apresentacao das propostas"]),
    );
  const remainingInfo = formatEmailDeadlineDays(deadlineAt);
  const entityStr = firstEmailText(
    entityName,
    announcement?.entity_name,
    pickEmailPayloadValue(payload, ["designacaoEntidade", "Designacao da entidade adjudicante"]),
  );
  const cpvStr = formatEmailCpv(announcement, cpvMain, payload);
  const actTypeStr = toTitleCasePt(firstEmailText(
    extractEmailLabeledValue(detailText, ["Tipo de Contrato", "Tipo de Ato"]),
    pickEmailPayloadValue(payload, ["tipoContrato", "Tipo de Contrato", "tipoAto", "Tipo de Ato"]),
    announcement?.act_type,
  ));
  const procedureTypeStr = toTitleCasePt(firstEmailText(
    extractEmailLabeledValue(detailText, ["Tipo de Procedimento", "Modelo de Anúncio"]),
    pickEmailPayloadValue(payload, ["tipoProcedimento", "modeloAnuncio", "Tipo de Procedimento", "Modelo de Anúncio"]),
    announcement?.procedure_type,
  ));
 
  const objectStr = firstEmailText(
    title,
    announcement?.description,
    pickEmailPayloadValue(payload, ["descricaoAnuncio", "descricaoContrato", "Descricao", "Sumario"]),
  )
    .replace(/^\s*\d{6,}\s*[-–—]\s*/, "")  // Remove prefixo de ID do anúncio (ex: "2526000345 - ")
    .replace(/\.{3}$/, "");  // Remove trailing ellipsis
  const announcementNoStr = firstEmailText(announcement?.dr_announcement_no, announcement?.base_announcement_id);
  const marketOpportunitiesUrl = "https://mercado.helpdeskpublico.pt/mp/oportunidades-mercado";
  const opportunityFilters = new URLSearchParams();

  if (announcementNoStr !== "-") {
    opportunityFilters.set("announcement_number", announcementNoStr);
  }

  const cpvFilter = firstEmailText(announcement?.cpv_main, cpvMain);
  if (cpvFilter !== "-") {
    opportunityFilters.set("cpv", cpvFilter);
  }

  if (entityStr !== "-") {
    opportunityFilters.set("entity", entityStr);
  }

  if (procedureTypeStr !== "-") {
    opportunityFilters.set("model", procedureTypeStr);
  }

  const publicationDateIso = typeof announcement?.publication_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(announcement.publication_date)
    ? announcement.publication_date
    : (typeof publicationDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(publicationDate) ? publicationDate : "");

  if (publicationDateIso) {
    opportunityFilters.set("from_date", publicationDateIso);
    opportunityFilters.set("to_date", publicationDateIso);
  }

  const originalUrl = opportunityFilters.toString()
    ? `${marketOpportunitiesUrl}?${opportunityFilters.toString()}`
    : marketOpportunitiesUrl;
  const subject = `Helpdesk Público | Nova oportunidade: ${objectStr.slice(0, 70)}`;
  const headerLogoUrl = "https://irp.cdn-website.com/e91f0c02/dms3rep/multi/android-chrome-192x192.png";

  

  const deadlineColorMap = { green: "#6b8c3e", yellow: "#b45309", red: "#b91c1c" };
  const deadlineBgMap = { green: "#eef6e9", yellow: "#fff7ed", red: "#fef2f2" };
  const deadlineBorderMap = { green: "#cfe3bd", yellow: "#fed7aa", red: "#fecaca" };
  const deadlineLabelMap = { green: "#4d6b2a", yellow: "#9a6a2c", red: "#991b1b" };
  const deadlineColor = deadlineColorMap[remainingInfo.color];
  const deadlineBg = deadlineBgMap[remainingInfo.color];
  const deadlineBorder = deadlineBorderMap[remainingInfo.color];
  const deadlineLabel = deadlineLabelMap[remainingInfo.color];

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeEmailHtml(subject)}</title>
  <style type="text/css">
    a, a:link, a:visited, a:hover, a:active {
      color: #111111 !important;
      cursor: pointer !important;
      text-decoration: none !important;
    }
    a span {
      cursor: pointer !important;
      text-decoration: none !important;
    }
    span.MsoHyperlink, span.MsoHyperlinkFollowed {
      color: #111111 !important;
      text-decoration: none !important;
    }
    .link-black, .link-black:link, .link-black:visited, .link-black:hover, .link-black:active {
      color: #111111 !important;
    }
    .link-white, .link-white:link, .link-white:visited, .link-white:hover, .link-white:active {
      color: #ffffff !important;
    }
  </style>
</head>

<body id="body" style="margin:0; padding:0; box-sizing:border-box; font-family:Arial, Helvetica, sans-serif; line-height:1.5; color:#333333; background-color:#f5f5f3;">

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f5f3;">
    <tr>
      <td align="center" style="padding:12px;">

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:700px; background-color:#ffffff; border:1px solid #e0e0dc;">

          <!-- HEADER -->
          <tr>
            <td style="padding:20px 18px; background-color:#2d4a1e;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="52" valign="middle" style="width:52px; padding:0 12px 0 0;">
                    <img src="${headerLogoUrl}" width="52" height="52" alt="Helpdesk Público" style="display:block; border:0;">
                  </td>
                  <td valign="middle" style="color:#ffffff;">
                    <div style="font-size:21px; line-height:25px; font-weight:700; color:#ffffff;">Helpdesk Público</div>
                    <div style="font-size:14px; line-height:18px; color:#ffffff; margin-top:4px;">Contratação Pública Eficiente</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BADGE -->
          <tr>
            <td style="padding:18px 18px 4px 18px;">
              <div style="background-color:#eef6e9; padding:11px 14px; font-size:14px; line-height:19px; color:#2d4a1e; font-weight:700;">
                Identificámos uma oportunidade de Contratação Pública
              </div>
            </td>
          </tr>

          <!-- OBJETO DO CONTRATO -->
          <tr>
            <td style="padding:18px 18px 8px 18px;">
              <div style="font-size:12px; line-height:16px; color:#6b7280; text-transform:uppercase; font-weight:700; letter-spacing:0.3px; margin-bottom:6px;">Objeto do contrato</div>
              <div style="font-size:21px; line-height:29px; color:#111827; font-weight:700; word-break:break-word; overflow-wrap:anywhere;">${escapeEmailHtml(objectStr)}</div>
            </td>
          </tr>

          <!-- DETALHES DO PROCEDIMENTO -->
          <tr>
            <td style="padding:8px 18px 4px 18px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e5e0;">
                <tr>
                  <td style="padding:14px 16px; background-color:${deadlineBg}; border-bottom:1px solid #e5e5e0;">
                    <div style="font-size:12px; line-height:16px; color:${deadlineLabel}; text-transform:uppercase; font-weight:700; letter-spacing:0.3px; margin-bottom:4px;">Prazo</div>
                    <div style="font-size:22px; line-height:26px; color:${deadlineColor}; font-weight:700; word-break:break-word;">${escapeEmailHtml(remainingInfo.text)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px; border-bottom:1px solid #e5e5e0;">
                    <div style="font-size:12px; line-height:16px; color:#6b7280; font-weight:700; margin-bottom:3px;">Data limite</div>
                    <div style="font-size:15px; line-height:21px; color:#111827; font-weight:700; word-break:break-word;">${escapeEmailHtml(deadlineStr)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px; border-bottom:1px solid #e5e5e0;">
                    <div style="font-size:12px; line-height:16px; color:#6b7280; font-weight:700; margin-bottom:3px;">Preço base</div>
                    <div style="font-size:15px; line-height:21px; color:#111827; font-weight:700; word-break:break-word;">${escapeEmailHtml(priceStr)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px; border-bottom:1px solid #e5e5e0;">
                    <div style="font-size:12px; line-height:16px; color:#6b7280; font-weight:700; margin-bottom:3px;">Tipo de ato</div>
                    <div style="font-size:15px; line-height:21px; color:#111827; font-weight:700; word-break:break-word;">${escapeEmailHtml(actTypeStr)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px; border-bottom:1px solid #e5e5e0;">
                    <div style="font-size:12px; line-height:16px; color:#6b7280; font-weight:700; margin-bottom:3px;">Tipo de procedimento</div>
                    <div style="font-size:15px; line-height:21px; color:#111827; font-weight:700; word-break:break-word;">${escapeEmailHtml(procedureTypeStr)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px; border-bottom:1px solid #e5e5e0;">
                    <div style="font-size:12px; line-height:16px; color:#6b7280; font-weight:700; letter-spacing:0.3px; margin-bottom:5px;">Entidade(s) Adjudicante(s)</div>
                    <div style="font-size:15px; line-height:21px; color:#111827; font-weight:600; word-break:break-word; overflow-wrap:anywhere;">${escapeEmailHtml(entityStr)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;">
                    <div style="font-size:12px; line-height:16px; color:#6b7280; font-weight:700; letter-spacing:0.3px; margin-bottom:5px;">CPV(s)</div>
                    <div style="font-size:15px; line-height:21px; color:#111827; font-weight:600; word-break:break-word; overflow-wrap:anywhere;">${escapeEmailHtml(cpvStr)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BOTAO -->
          <tr>
            <td align="center" style="padding:22px 18px 12px 18px;">
              <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" bgcolor="#2d4a1e" style="background-color:#2d4a1e; border:1px solid #2d4a1e; mso-padding-alt:15px 26px;">
                    <a href="${escapeEmailHtml(originalUrl)}" target="_blank" class="link-white" style="display:block; padding:15px 26px; font-size:16px; line-height:19px; font-weight:700; color:#ffffff !important; mso-style-textfill-type:solid; mso-style-textfill-fill-color:#ffffff; text-decoration:none; background-color:#2d4a1e; white-space:nowrap; font-family:Arial, Helvetica, sans-serif;">
                      <span style="color:#ffffff !important; mso-style-textfill-type:solid; mso-style-textfill-fill-color:#ffffff;">Aceda ao Procedimento</span>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- PARAGRAFO -->
          <tr>
            <td style="padding:4px 18px 14px 18px;">
              <div style="font-size:14px; line-height:21px; color:#4b5563;">Consulte toda a informação disponível sobre o procedimento, aceda diretamente às peças concursais e confirme os requisitos de participação antes do prazo limite.</div>
            </td>
          </tr>

          <!-- NOTA DE MONITORIZACAO -->
          <tr>
            <td style="padding:0 18px 14px 18px;">
              <div style="background-color:#eef6e9; padding:12px 14px; font-size:13px; line-height:19px; color:#4b5563;">
                Este procedimento foi identificado automaticamente com base nos critérios de monitorização da sua conta.
              </div>
            </td>
          </tr>

          <!-- SUPORTE -->
          <tr>
            <td style="padding:20px 18px; background-color:#edf3e6; border-top:1px solid #d7e3c8;">
              <div style="font-size:14px; line-height:19px; color:#3f5e26; font-weight:700; margin-bottom:12px;">Precisa de apoio para decidir ou preparar a sua proposta?</div>
              <div style="text-align:center; font-size:0;">
                <!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="49%" valign="top"><![endif]-->
                <div style="display:inline-block; width:100%; max-width:310px; vertical-align:top;">
                  <div style="padding:0 6px 8px 6px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border:1px solid #d1d5db; background-color:#ffffff;">
                      <tr>
                        <td height="56" align="center" valign="middle" style="padding:8px 14px; font-size:14px; line-height:19px;">
                          <a href="https://www.helpdeskpublico.pt/go-no-go-concursos-publicos" target="_blank" class="link-black" style="font-size:14px; line-height:19px; font-weight:700; color:#111111 !important; mso-style-textfill-type:solid; mso-style-textfill-fill-color:#111111; text-decoration:none;"><span style="color:#111111 !important; mso-style-textfill-type:solid; mso-style-textfill-fill-color:#111111;">Go / No-Go<br>Concursos Públicos</span></a>
                        </td>
                      </tr>
                    </table>
                  </div>
                </div>
                <!--[if mso]></td><td width="2%" valign="top" style="font-size:0; line-height:0;">&nbsp;</td><td width="49%" valign="top"><![endif]-->
                <div style="display:inline-block; width:100%; max-width:310px; vertical-align:top;">
                  <div style="padding:0 6px 8px 6px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border:1px solid #d1d5db; background-color:#ffffff;">
                      <tr>
                        <td height="56" align="center" valign="middle" style="padding:8px 14px; font-size:14px; line-height:19px;">
                          <a href="https://www.helpdeskpublico.pt/plataforma-suporte-contratacao-publica" target="_blank" class="link-black" style="font-size:14px; line-height:19px; font-weight:700; color:#111111 !important; mso-style-textfill-type:solid; mso-style-textfill-fill-color:#111111; text-decoration:none;"><span style="color:#111111 !important; mso-style-textfill-type:solid; mso-style-textfill-fill-color:#111111;">Plataforma de Suporte<br>Contratação Pública</span></a>
                        </td>
                      </tr>
                    </table>
                  </div>
                </div>
                <!--[if mso]></td></tr></table><![endif]-->
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding:18px 18px; border-top:1px solid #e5e5e0;">
              <div style="font-size:14px; line-height:19px; color:#111111; font-weight:700; margin-bottom:10px;">Helpdesk Público &ndash; Contratação Pública Eficiente</div>
              <div style="font-size:13px; line-height:18px; color:#9ca3af; margin-bottom:8px;">
                <a href="https://www.helpdeskpublico.pt/contactos" target="_blank" class="link-black" style="color:#111111 !important; mso-style-textfill-type:solid; mso-style-textfill-fill-color:#111111; text-decoration:none; font-weight:700;"><span style="color:#111111 !important; mso-style-textfill-type:solid; mso-style-textfill-fill-color:#111111;">Contactos</span></a>
                <span style="color:#d1d5db;"> | </span>
                <a href="https://www.helpdeskpublico.pt/privacidade" target="_blank" class="link-black" style="color:#111111 !important; mso-style-textfill-type:solid; mso-style-textfill-fill-color:#111111; text-decoration:none; font-weight:700;"><span style="color:#111111 !important; mso-style-textfill-type:solid; mso-style-textfill-fill-color:#111111;">Política de Privacidade</span></a>
                <span style="color:#d1d5db;"> | </span>
                <a href="https://www.helpdeskpublico.pt" target="_blank" class="link-black" style="color:#111111 !important; mso-style-textfill-type:solid; mso-style-textfill-fill-color:#111111; text-decoration:none; font-weight:700;"><span style="color:#111111 !important; mso-style-textfill-type:solid; mso-style-textfill-fill-color:#111111;">Website</span></a>
              </div>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

  const text = `Nova oportunidade
=================
Objeto: ${objectStr}
Entidade (s) Adjudicante (s): ${entityStr}
CPV: ${cpvStr}
Valor: ${priceStr}
Prazo: ${deadlineStr}
Dias restantes: ${remainingInfo.text}
Referência: ${announcementNoStr}
Link: ${originalUrl}`;

  return { subject, html, text };
}

export function buildAnnouncementEmailOutlook(params: {
  clientName: string;
  title: string;
  entityName?: string | null;
  publicationDate?: string | null;
  cpvMain?: string | null;
  basePrice?: number | null;
  currency?: string;
  detailUrl?: string | null;
  appBaseUrl: string;
  announcement?: Record<string, unknown>;
}): { subject: string; html: string; text: string } {
  return buildAnnouncementEmail(params);
}
