/**
 * Email provider abstraction.
 *
 * Supported providers (EMAIL_PROVIDER env var):
 *   "dev"       → logs to console (default for local development)
 *   "mailpit"   → sends via Mailpit SMTP-over-HTTP (local Supabase)
 *   "sendgrid"  → SendGrid HTTP API
 *
 * For production: set EMAIL_PROVIDER=sendgrid and SENDGRID_API_KEY.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
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
    console.log("─────────────────────────────────────────");
    return { success: true };
  }
}

// ---------------------------------------------------------------------------
// Mailpit provider (local Supabase – http://127.0.0.1:54324)
// Mailpit exposes a REST API at /api/v1/send (v1.20+)
// ---------------------------------------------------------------------------

class MailpitEmailProvider implements EmailProvider {
  private apiUrl: string;
  private from: string;

  constructor() {
    this.apiUrl = Deno.env.get("MAILPIT_URL") ?? "http://host.docker.internal:54324";
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
// Factory
// ---------------------------------------------------------------------------

export function createEmailProvider(): EmailProvider {
  const provider = (Deno.env.get("EMAIL_PROVIDER") ?? "dev").toLowerCase();

  switch (provider) {
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

export function buildAnnouncementEmail(params: {
  clientName: string;
  title: string;
  entityName: string | null;
  publicationDate: string;
  cpvMain: string | null;
  basePrice: number | null;
  currency: string;
  detailUrl: string | null;
  appBaseUrl: string;
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
  } = params;

  const priceStr = basePrice
    ? `${basePrice.toLocaleString("pt-PT")} ${currency}`
    : "Não especificado";

  const subject = `Novo anúncio BASE: ${title.slice(0, 60)}`;

  const html = `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; }
  .header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
  .body { background: #f8fafc; padding: 20px; }
  .field { margin: 8px 0; }
  .label { font-weight: bold; color: #475569; font-size: 12px; text-transform: uppercase; }
  .value { color: #1e293b; font-size: 15px; }
  .btn { display: inline-block; background: #1e40af; color: white; padding: 10px 20px;
         border-radius: 6px; text-decoration: none; margin-top: 16px; }
  .footer { font-size: 11px; color: #94a3b8; padding: 12px 20px; }
</style></head>
<body>
  <div class="header">
    <h2 style="margin:0">Novo Anúncio BASE</h2>
    <p style="margin:4px 0 0;opacity:.8">BASE Monitor – Alerta de contratação pública</p>
  </div>
  <div class="body">
    <p>Olá <strong>${clientName}</strong>,</p>
    <p>Foi publicado um novo anúncio que corresponde às suas regras CPV:</p>

    <div class="field"><div class="label">Título</div><div class="value">${title}</div></div>
    ${entityName ? `<div class="field"><div class="label">Entidade</div><div class="value">${entityName}</div></div>` : ""}
    <div class="field"><div class="label">Data de publicação</div><div class="value">${publicationDate}</div></div>
    ${cpvMain ? `<div class="field"><div class="label">CPV principal</div><div class="value">${cpvMain}</div></div>` : ""}
    <div class="field"><div class="label">Preço base</div><div class="value">${priceStr}</div></div>

    ${
      detailUrl
        ? `<a href="${detailUrl}" class="btn">Ver anúncio no BASE</a>`
        : `<a href="${appBaseUrl}/announcements" class="btn">Ver no BASE Monitor</a>`
    }
  </div>
  <div class="footer">
    Recebe este email porque está registado no BASE Monitor.
    Para gerir as suas preferências aceda a <a href="${appBaseUrl}/settings">${appBaseUrl}/settings</a>.
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
