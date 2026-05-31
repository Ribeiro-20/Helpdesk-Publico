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

    if (!res.ok) {
      const error = await res.text();
      return { success: false, error: `Brevo ${res.status}: ${error}` };
    }

    return { success: true };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEmailProvider(): EmailProvider {
  const provider = (Deno.env.get("EMAIL_PROVIDER") ?? "dev").toLowerCase();

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

function safeDate(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-PT");
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
          ? `<a href="${detailUrl}" class="btn">Ver original</a>`
          : `<a href="${appBaseUrl}/announcements" class="btn">Ver original</a>`
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
