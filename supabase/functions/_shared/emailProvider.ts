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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function loadHeaderLogoDataUrl(): Promise<string> {
  const denoWithFs = Deno as typeof Deno & {
    readFile(path: string | URL): Promise<Uint8Array>;
  };

  const candidates = [
    "../../../apps/web/public/logo-white.png",
    "../../../apps/web/public/logo.png",
    "../../../apps/web/public/bandeira-fundo-escuro-01.png",
  ];

  for (const candidate of candidates) {
    try {
      const fileUrl = new URL(candidate, import.meta.url);
      const bytes = await denoWithFs.readFile(fileUrl);
      return `data:image/png;base64,${bytesToBase64(bytes)}`;
    } catch {
      // Try next candidate.
    }
  }

  console.warn("[email] could not load a local header logo from known paths");
  return "";
}

const HEADER_LOGO_DATA_URL = await loadHeaderLogoDataUrl();

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
    this.from = Deno.env.get("EMAIL_FROM") ?? "noreply@localhost";
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
    this.from = Deno.env.get("EMAIL_FROM") ?? "noreply@example.com";
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
    this.fromEmail = Deno.env.get("EMAIL_FROM") ?? "noreply@example.com";
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

function pickEmailPayloadValue(payload: Record<string, unknown> | null, keys: string[]): unknown {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    if (value != null && value !== "") return value;
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
  const {
    clientName,
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

  const priceStr = basePrice
    ? `${basePrice.toLocaleString("pt-PT")} ${currency}`
    : "Não especificado";

  const subject = `Novo anúncio BASE: ${title.slice(0, 60)}`;
  const safeDescription = String((announcement && (announcement.description ?? announcement.descricao ?? announcement.sumario)) ?? "").trim();
  const descriptionShort = safeDescription
    ? (safeDescription.length > 1000 ? `${safeDescription.slice(0, 1000)}...` : safeDescription)
    : null;
  const sections = announcement ? buildAnnouncementSections(announcement) : [];

  const html = `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; background: #f3f6f7; margin: 0; padding: 20px; }
  .container { max-width: 760px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
  .header { background: #124c2b; color: white; padding: 24px 26px; }
  .brand { font-size: 20px; font-weight: 700; margin: 0; }
  .subtitle { margin: 4px 0 0; opacity: 0.9; font-size: 13px; }
  .summary { padding: 18px 26px; background: #f8fafc; border-bottom: 1px solid #e8eef0; }
  .summary-grid { display: table; width: 100%; border-collapse: collapse; }
  .summary-cell { display: table-cell; vertical-align: top; padding-right: 12px; width: 25%; }
  .chip { background: #ffffff; border: 1px solid #e5edf0; padding: 10px 12px; border-radius: 6px; min-height: 58px; }
  .chip .label { display:block; font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:.02em; }
  .chip .value { display:block; font-weight:700; color:#0f1724; margin-top:6px; line-height: 1.25; }
  .content { padding: 20px 26px 26px; color: #0f1724; }
  .greeting { font-size: 14px; margin: 0 0 12px 0; color: #475569; }
  .title { font-size: 18px; line-height: 1.35; font-weight:700; margin: 0 0 16px 0; color:#111827; }
  .section { margin-top: 18px; }
  .section-title { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #124c2b; margin: 0 0 10px 0; font-weight: 700; }
  .table { width: 100%; border-collapse: collapse; border: 1px solid #e6eef0; border-radius: 8px; overflow: hidden; }
  .table td { border-bottom: 1px solid #edf2f4; padding: 10px 12px; vertical-align: top; font-size: 13px; }
  .table tr:last-child td { border-bottom: none; }
  .table td.label { width: 34%; background: #f8fafc; color: #64748b; font-weight: 700; text-transform: none; }
  .table td.value { color: #111827; font-weight: 600; word-break: break-word; }
  .description { margin-top: 14px; padding: 14px 16px; background: #f8fafc; border: 1px solid #e6eef0; border-radius: 8px; }
  .description .label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; display:block; margin-bottom: 6px; }
  .description .value { font-size: 13px; line-height: 1.55; color: #111827; white-space: pre-wrap; }
  .btn { display:inline-block; background:#124c2b; color:#ffffff !important; padding:11px 18px; border-radius:8px; text-decoration:none; margin-top:16px; font-weight:700; }
  .footer { padding:14px 26px; font-size:12px; color:#6b7280; background:#fbfdfe; border-top: 1px solid #edf2f4; }
  .muted { color:#6b7280; font-size:12px; }
</style></head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">Helpdesk Público</div>
      <div class="subtitle">Detalhe do anúncio</div>
    </div>

    <div class="summary">
      <div class="summary-grid">
        <div class="summary-cell"><div class="chip"><span class="label">Publicado</span><span class="value">${publicationDate ?? "-"}</span></div></div>
        <div class="summary-cell"><div class="chip"><span class="label">Entidade</span><span class="value">${entityName ?? "-"}</span></div></div>
        <div class="summary-cell"><div class="chip"><span class="label">CPV</span><span class="value">${cpvMain ?? "-"}</span></div></div>
        <div class="summary-cell"><div class="chip"><span class="label">Preço base</span><span class="value">${priceStr}</span></div></div>
      </div>
    </div>

    <div class="content">
      <p class="greeting">Olá <strong>${clientName}</strong>, foi publicado um novo anúncio que corresponde às suas regras CPV.</p>
      <div class="title">${title}</div>

      ${descriptionShort ? `
        <div class="description">
          <span class="label">Descrição</span>
          <div class="value">${descriptionShort}</div>
        </div>
      ` : ""}

      ${sections.map((section) => `
        <div class="section">
          <div class="section-title">${section.title}</div>
          <table class="table" role="presentation">
            <tbody>
              ${section.rows.map((row) => `
                <tr>
                  <td class="label">${row.label}</td>
                  <td class="value">${row.value}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `).join("")}

      <div class="muted" style="margin-top:14px">${announcement?.detail_url ? `ID: ${String(announcement.id ?? "-")}` : ""}</div>
      ${
        detailUrl
          ? `<a href="${detailUrl}" class="btn">Ver mais detalhes</a>`
          : `<a href="${appBaseUrl}/announcements" class="btn">Ver mais detalhes</a>`
      }
    </div>

    <div class="footer">
      Recebe este email porque está registado no Helpdesk Público. Para gerir as suas preferências aceda a <a href="${appBaseUrl}/settings">${appBaseUrl}/settings</a>.
    </div>
  </div>
</body>
</html>`;

  const text = `Novo Anúncio BASE
=================
Título: ${title}
${entityName ? `Entidade: ${entityName}` : ""}
Data: ${publicationDate}
${cpvMain ? `CPV: ${cpvMain}` : ""}
Preço base: ${priceStr}
${detailUrl ? `Link: ${detailUrl}` : `Ver em: ${appBaseUrl}/announcements`}`;

  return { subject, html, text };
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
    clientName,
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

  const priceStr = formatEmailPrice(basePrice, currency ?? "EUR");
  const publishedStr = publicationDate ? safeDate(publicationDate) : "-";
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
  const actTypeStr = firstEmailText(
    announcement?.act_type,
    pickEmailPayloadValue(payload, ["tipoAto", "Tipo de Ato"]),
  );
  const procedureTypeStr = firstEmailText(
    announcement?.procedure_type,
    pickEmailPayloadValue(payload, ["tipoProcedimento", "modeloAnuncio", "Tipo de Procedimento"]),
  );
 
  const objectStr = firstEmailText(
    title,
    announcement?.description,
    pickEmailPayloadValue(payload, ["descricaoAnuncio", "descricaoContrato", "Descricao", "Sumario"]),
  ).replace(/\.{3}$/, "");  // Remove trailing ellipsis
  const announcementNoStr = firstEmailText(announcement?.dr_announcement_no, announcement?.base_announcement_id);
  const originalUrl = detailUrl ?? `${appBaseUrl}/announcements`;
  const subject = `Nova oportunidade: ${objectStr.slice(0, 70)}`;
  const headerLogoUrl = "https://irp.cdn-website.com/e91f0c02/dms3rep/multi/android-chrome-192x192.png";

  

  const deadlineColorMap = { green: "#6b8c3e", yellow: "#b45309", red: "#b91c1c" };
  const deadlineColor = deadlineColorMap[remainingInfo.color];

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="width:100%;background:#f5f5f3;padding:20px 0;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:4px;overflow:hidden;border:1px solid #e0e0dc;">

      <!-- HEADER -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#2d4a1e;">
        <tr>
          <td style="padding:18px 24px 14px 24px;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:10px;vertical-align:middle;">
                  <img src="${headerLogoUrl}" width="52" height="52" alt="" style="display:block;width:52px;height:52px;border:0;outline:none;text-decoration:none;" />
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:0.01em;line-height:1.1;">Helpdesk Público</div>
                  <div style="font-size:13px;color:#d3e9a0;margin-top:4px;font-weight:400;line-height:1.15;">Contratação Pública Eficiente</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- ALERT BADGE -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
        <tr>
          <td style="padding:14px 20px 2px 20px;">
            <table cellpadding="0" cellspacing="0" border="0" style="background:#3a5c22;border-radius:20px;padding:0;">
              <tr>
                <td style="padding:7px 14px 7px 10px;">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="14" style="width:14px;padding-right:6px;vertical-align:middle;font-size:13px;line-height:13px;color:#7ec94a;">&#9679;</td>
                      <td style="font-size:12px;color:#d4edaa;font-weight:600;white-space:nowrap;">Nova oportunidade identificada para si</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CARDS -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:20px 20px 0 20px;background:#ffffff;">
        <tr>
          <td width="33%" style="padding:6px 4px 6px 0;">
            <div style="background:#f7f7f5;border:1px solid #e5e5e0;border-radius:6px;padding:14px 10px;text-align:center;">
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Prazo restante</div>
              <div style="font-size:22px;font-weight:800;color:${deadlineColor};line-height:1;">${remainingInfo.daysRemaining} dias</div>
            </div>
          </td>
          <td width="33%" style="padding:6px 4px;">
            <div style="background:#f7f7f5;border:1px solid #e5e5e0;border-radius:6px;padding:14px 10px;text-align:center;">
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Data limite</div>
              <div style="font-size:15px;font-weight:700;color:#111827;line-height:1.3;">${escapeEmailHtml(deadlineStr)}</div>
            </div>
          </td>
          <td width="33%" style="padding:6px 0 6px 4px;">
            <div style="background:#f7f7f5;border:1px solid #e5e5e0;border-radius:6px;padding:14px 10px;text-align:center;">
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Preço base</div>
              <div style="font-size:15px;font-weight:800;color:#111827;line-height:1.3;">${escapeEmailHtml(priceStr)}</div>
            </div>
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:0 20px 0 20px;background:#ffffff;">
        <tr>
          <td width="50%" style="padding:6px 4px 0 0;">
            <div style="background:#f7f7f5;border:1px solid #e5e5e0;border-radius:6px;padding:14px 10px;text-align:center;">
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Tipo de ato</div>
              <div style="font-size:15px;font-weight:700;color:#111827;line-height:1.3;">${escapeEmailHtml(actTypeStr)}</div>
            </div>
          </td>
          <td width="50%" style="padding:6px 0 0 4px;">
            <div style="background:#f7f7f5;border:1px solid #e5e5e0;border-radius:6px;padding:14px 10px;text-align:center;">
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Tipo de procedimento</div>
              <div style="font-size:15px;font-weight:700;color:#111827;line-height:1.3;">${escapeEmailHtml(procedureTypeStr)}</div>
            </div>
          </td>
        </tr>
      </table>

      <!-- BODY -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:16px 20px 0 20px;background:#ffffff;">

        <!-- Entidade -->
        <tr>
          <td style="padding-bottom:12px;">
            <div style="border:1px solid #e5e5e0;border-radius:6px;padding:12px 14px;">
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:6px;">Entidade(s) Adjudicante(s)</div>
              <div style="font-size:14px;color:#111827;font-weight:600;line-height:1.4;">${escapeEmailHtml(entityStr)}</div>
            </div>
          </td>
        </tr>

        <!-- CPV -->
        <tr>
          <td style="padding-bottom:12px;">
            <div style="border:1px solid #e5e5e0;border-radius:6px;padding:12px 14px;">
              <div style="font-size:11px;color:#6b7280;letter-spacing:.05em;font-weight:700;margin-bottom:6px;">CPV(s)</div>
              <div style="font-size:14px;color:#111827;font-weight:600;line-height:1.4;">${escapeEmailHtml(cpvStr)}</div>
            </div>
          </td>
        </tr>

        
       

        <!-- Objeto do Contrato -->
        <tr>
          <td style="padding-bottom:20px;">
            <div style="background:#f7f7f5;border-radius:6px;padding:14px;">
              <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Objeto do Contrato</div>
              <div style="font-size:14px;color:#111827;font-weight:500;line-height:1.55;">${escapeEmailHtml(objectStr)}</div>
            </div>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding-bottom:14px;">
            <a href="${escapeEmailHtml(originalUrl)}" style="display:block;background:#2d4a1e;color:#ffffff;text-align:center;text-decoration:none;font-size:15px;font-weight:700;padding:15px;border-radius:6px;">Ver todos os detalhes</a>
          </td>
        </tr>

        <!-- Checklist -->
        <tr>
          <td style="padding-bottom:24px;">
            <div style="font-size:13px;color:#4b5563;line-height:2;">
              <div>✓ Consulte todos os detalhes do procedimento</div>
              <div>✓ Aceda diretamente às peças do procedimento</div>
              <div>✓ Verifique requisitos e prazo de participação</div>
            </div>
          </td>
        </tr>

      </table>

      <!-- UPSELL -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f7f5;border-top:1px solid #e5e5e0;">
        <tr>
          <td style="padding:20px 20px 8px 20px;">
            <div style="font-size:13px;color:#6b7280;font-weight:600;margin-bottom:14px;">Precisa de suporte especializado?</div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="50%" style="padding:0 6px 10px 0;">
                  <a href="https://www.helpdeskpublico.pt/go-no-go-concursos-publicos" style="display:block;background:#ffffff;border:1px solid #d1d5db;border-radius:6px;padding:12px 14px;text-decoration:none;text-align:center;">
                    <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">Go / No-Go</div>
                    <div style="font-size:11px;color:#374151;">Concursos Públicos</div>
                  </a>
                </td>
                <td width="50%" style="padding:0 0 10px 6px;">
                  <a href="https://www.helpdeskpublico.pt/" style="display:block;background:#ffffff;border:1px solid #d1d5db;border-radius:6px;padding:12px 14px;text-decoration:none;text-align:center;">
                    <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">Plataforma de Suporte</div>
                    <div style="font-size:11px;color:#374151;">Contratação Pública</div>
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- FOOTER -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-top:1px solid #e5e5e0;">
        <tr>
          <td style="padding:16px 20px;text-align:center;">
            <div style="margin-bottom:10px;">
              <a href="https://www.linkedin.com/company/helpdeskpublico/posts/?feedView=all" target="_blank" style="color:#9ca3af;text-decoration:none;font-size:13px;font-weight:700;margin:0 8px;">in</a>
              <a href="https://www.instagram.com/helpdeskpublico?igsh=ejhsajhpeWI3azY5" target="_blank" style="color:#9ca3af;text-decoration:none;font-size:13px;font-weight:700;margin:0 8px;">ig</a>
            </div>
            <div style="font-size:11px;color:#9ca3af;">
              Helpdesk Público &middot; <a href="#" style="color:#6b7280;text-decoration:none;">aviso legal</a> &middot; <a href="#" style="color:#6b7280;text-decoration:none;">cancelar subscrição</a>
            </div>
          </td>
        </tr>
      </table>

    </div>
  </div>
</body>
</html>`;

  const text = `Nova oportunidade
=================
Objeto: ${objectStr}
Entidade (s) Adjudicante (s): ${entityStr}
Referência: ${announcementNoStr}
Link: ${originalUrl}`;

  return { subject, html, text };
}

// Outlook-specific version with table-based layout (border-radius and flexbox incompatible)
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
  const {
    clientName,
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

  const priceStr = formatEmailPrice(basePrice, currency ?? "EUR");
  const publishedStr = publicationDate ? safeDate(publicationDate) : "-";
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
  const actTypeStr = firstEmailText(
    announcement?.act_type,
    pickEmailPayloadValue(payload, ["tipoAto", "Tipo de Ato"]),
  );
  const procedureTypeStr = firstEmailText(
    announcement?.procedure_type,
    pickEmailPayloadValue(payload, ["tipoProcedimento", "modeloAnuncio", "Tipo de Procedimento"]),
  );
  const objectStr = firstEmailText(
    title,
    announcement?.description,
    pickEmailPayloadValue(payload, ["descricaoAnuncio", "descricaoContrato", "Descricao", "Sumario"]),
  ).replace(/\.{3}$/, "");
  const announcementNoStr = firstEmailText(announcement?.dr_announcement_no, announcement?.base_announcement_id);
  const originalUrl = detailUrl ?? `${appBaseUrl}/announcements`;
  const subject = `Nova oportunidade: ${objectStr.slice(0, 70)}`;
  const headerLogoUrl = "https://irp.cdn-website.com/e91f0c02/dms3rep/multi/android-chrome-192x192.png";
  const deadlineColorMap = { green: "#6b8c3e", yellow: "#b45309", red: "#b91c1c" };
  const deadlineColor = deadlineColorMap[remainingInfo.color];

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="width:100%;background:#f5f5f3;padding:20px 0;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e0e0dc;">

      <!-- HEADER -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#2d4a1e">
        <tr>
          <td style="padding:18px 24px 14px 24px;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:10px;vertical-align:middle;">
                  <img src="${headerLogoUrl}" width="52" height="52" alt="" style="display:block;width:52px;height:52px;border:0;outline:none;text-decoration:none;" />
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:0.01em;line-height:1.1;">Helpdesk Público</div>
                  <div style="font-size:13px;color:#d3e9a0;margin-top:4px;font-weight:400;line-height:1.15;">Contratação Pública Eficiente</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- ALERT BADGE -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">
        <tr>
          <td style="padding:14px 20px 2px 20px;">
            <table cellpadding="0" cellspacing="0" border="0" bgcolor="#3a5c22" width="100%" style="border-radius:20px;overflow:hidden;">
              <tr>
                <td style="padding:7px 14px;">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="14" style="width:14px;padding-right:6px;vertical-align:middle;font-size:13px;line-height:13px;color:#7ec94a;">&#9679;</td>
                      <td style="font-size:12px;color:#d4edaa;font-weight:600;">Nova oportunidade identificada para si</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CARDS -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">
        <tr>
          <td style="padding:20px 20px 0 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="33%" style="padding:0 4px 6px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="1" bordercolor="#e5e5e0" bgcolor="#f7f7f5" style="border-radius:8px;overflow:hidden;">
                    <tr><td style="padding:14px 10px;text-align:center;">
                      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Prazo restante</div>
                      <div style="font-size:22px;font-weight:800;color:${deadlineColor};line-height:1;">${remainingInfo.daysRemaining} dias</div>
                    </td></tr>
                  </table>
                </td>
                <td width="33%" style="padding:0 4px 6px 4px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="1" bordercolor="#e5e5e0" bgcolor="#f7f7f5" style="border-radius:8px;overflow:hidden;">
                    <tr><td style="padding:14px 10px;text-align:center;">
                      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Data limite</div>
                      <div style="font-size:15px;font-weight:700;color:#111827;line-height:1.3;">${escapeEmailHtml(deadlineStr)}</div>
                    </td></tr>
                  </table>
                </td>
                <td width="33%" style="padding:0 0 6px 4px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="1" bordercolor="#e5e5e0" bgcolor="#f7f7f5" style="border-radius:8px;overflow:hidden;">
                    <tr><td style="padding:14px 10px;text-align:center;">
                      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Preço base</div>
                      <div style="font-size:15px;font-weight:800;color:#111827;line-height:1.3;">${escapeEmailHtml(priceStr)}</div>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">
        <tr>
          <td style="padding:0 20px 0 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="50%" style="padding:6px 4px 0 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="1" bordercolor="#e5e5e0" bgcolor="#f7f7f5" style="border-radius:8px;overflow:hidden;">
                    <tr><td style="padding:14px 10px;text-align:center;">
                      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Tipo de ato</div>
                      <div style="font-size:15px;font-weight:700;color:#111827;line-height:1.3;">${escapeEmailHtml(actTypeStr)}</div>
                    </td></tr>
                  </table>
                </td>
                <td width="50%" style="padding:6px 0 0 4px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="1" bordercolor="#e5e5e0" bgcolor="#f7f7f5" style="border-radius:8px;overflow:hidden;">
                    <tr><td style="padding:14px 10px;text-align:center;">
                      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Tipo de procedimento</div>
                      <div style="font-size:15px;font-weight:700;color:#111827;line-height:1.3;">${escapeEmailHtml(procedureTypeStr)}</div>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- BODY -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">
        <tr>
          <td style="padding:16px 20px 0 20px;">
            <!-- Entidade -->
            <table width="100%" cellpadding="0" cellspacing="0" border="1" bordercolor="#e5e5e0" bgcolor="#ffffff" style="margin-bottom:12px;border-radius:8px;overflow:hidden;">
              <tr><td style="padding:12px 14px;">
                <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:6px;">Entidade(s) Adjudicante(s)</div>
                <div style="font-size:14px;color:#111827;font-weight:600;line-height:1.4;">${escapeEmailHtml(entityStr)}</div>
              </td></tr>
            </table>

            <!-- CPV -->
            <table width="100%" cellpadding="0" cellspacing="0" border="1" bordercolor="#e5e5e0" bgcolor="#ffffff" style="margin-bottom:12px;border-radius:8px;overflow:hidden;">
              <tr><td style="padding:12px 14px;">
                <div style="font-size:11px;color:#6b7280;letter-spacing:.05em;font-weight:700;margin-bottom:6px;">CPV(s)</div>
                <div style="font-size:14px;color:#111827;font-weight:600;line-height:1.4;">${escapeEmailHtml(cpvStr)}</div>
              </td></tr>
            </table>

            <!-- Objeto do Contrato -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f7f7f5" style="margin-bottom:20px;border-radius:8px;overflow:hidden;">
              <tr><td style="padding:14px;">
                <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Objeto do Contrato</div>
                <div style="font-size:14px;color:#111827;font-weight:500;line-height:1.55;">${escapeEmailHtml(objectStr)}</div>
              </td></tr>
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
              <tr><td style="text-align:center;">
                <a href="${escapeEmailHtml(originalUrl)}" style="background:#2d4a1e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 20px;display:inline-block;">Ver todos os detalhes</a>
              </td></tr>
            </table>

            <!-- Checklist -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr><td style="font-size:13px;color:#4b5563;line-height:2;">
                ✓ Consulte todos os detalhes do procedimento<br/>
                ✓ Aceda diretamente às peças do procedimento<br/>
                ✓ Verifique requisitos e prazo de participação
              </td></tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- UPSELL -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f7f7f5" style="border-top:1px solid #e5e5e0;">
        <tr>
          <td style="padding:20px 20px 8px 20px;">
            <div style="font-size:13px;color:#6b7280;font-weight:600;margin-bottom:14px;">Precisa de suporte especializado?</div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="50%" style="padding:0 6px 10px 0;">
                  <a href="https://www.helpdeskpublico.pt/go-no-go-concursos-publicos" style="display:block;background:#ffffff;border:1px solid #d1d5db;border-radius:8px;padding:12px 14px;text-decoration:none;text-align:center;">
                    <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">Go / No-Go</div>
                    <div style="font-size:11px;color:#374151;">Concursos Públicos</div>
                  </a>
                </td>
                <td width="50%" style="padding:0 0 10px 6px;">
                  <a href="https://www.helpdeskpublico.pt/" style="display:block;background:#ffffff;border:1px solid #d1d5db;border-radius:8px;padding:12px 14px;text-decoration:none;text-align:center;">
                    <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">Plataforma de Suporte</div>
                    <div style="font-size:11px;color:#374151;">Contratação Pública</div>
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- FOOTER -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-top:1px solid #e5e5e0;">
        <tr>
          <td style="padding:16px 20px;text-align:center;">
            <div style="margin-bottom:10px;">
              <a href="https://www.linkedin.com/company/helpdeskpublico/posts/?feedView=all" target="_blank" style="color:#9ca3af;text-decoration:none;font-size:13px;font-weight:700;margin:0 8px;">in</a>
              <a href="https://www.instagram.com/helpdeskpublico?igsh=ejhsajhpeWI3azY5" target="_blank" style="color:#9ca3af;text-decoration:none;font-size:13px;font-weight:700;margin:0 8px;">ig</a>
            </div>
            <div style="font-size:11px;color:#9ca3af;">
              Helpdesk Público &middot; <a href="#" style="color:#6b7280;text-decoration:none;">aviso legal</a> &middot; <a href="#" style="color:#6b7280;text-decoration:none;">cancelar subscrição</a>
            </div>
          </td>
        </tr>
      </table>

    </div>
  </div>
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
