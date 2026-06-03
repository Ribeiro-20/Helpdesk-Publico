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
// Brevo provider
// ---------------------------------------------------------------------------

class BrevoEmailProvider implements EmailProvider {
  private apiKey: string;
  private from: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.from = Deno.env.get("EMAIL_FROM") ?? "helpdesk.publico@gmail.com";
  }

  async send(msg: EmailMessage): Promise<SendResult> {
    const body = {
      sender: { name: "Market Intelligence | Helpdesk Público", email: this.from },
      to: [{ email: msg.to }],
      subject: msg.subject,
      htmlContent: msg.html,
      ...(msg.text ? { textContent: msg.text } : {}),
    };

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": this.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
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
    case "sendgrid": {
      const key = Deno.env.get("SENDGRID_API_KEY");
      if (!key) throw new Error("EMAIL_PROVIDER=sendgrid but SENDGRID_API_KEY is not set");
      return new SendGridEmailProvider(key);
    }
    case "brevo": {
      const key = Deno.env.get("BREVO_API_KEY");
      if (!key) throw new Error("EMAIL_PROVIDER=brevo but BREVO_API_KEY is not set");
      return new BrevoEmailProvider(key);
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

// ---------------------------------------------------------------------------
// MI Contract Alert Email Template
// ---------------------------------------------------------------------------

export interface MiContractAlertParams {
  subscriberName: string;
  contracts: Array<{
    object: string;
    entity: string;
    winner: string;
    progress: number;
    contractPrice: number | null;
    signingDate: string;
    deadlineDays: number;
    estimatedEndDate: string;
  }>;
  appBaseUrl: string;
}

export function buildMiContractAlertEmail(params: MiContractAlertParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { subscriberName, contracts, appBaseUrl } = params;

  const subject = `Market Intelligence: ${contracts.length} contrato(s) prestes a terminar`;

  const contractRows = contracts
    .map((c) => {
      const progressPct = Math.round(c.progress * 100);
      const barColor = progressPct >= 100 ? "#ef4444" : progressPct >= 90 ? "#f59e0b" : "#22c55e";
      const priceStr = c.contractPrice
        ? new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(c.contractPrice)
        : "N/A";

      return `
      <tr>
        <td style="padding:16px; border-bottom:1px solid #e2e8f0;">
          <div style="font-weight:600; color:#1e293b; margin-bottom:4px;">${c.object.slice(0, 100)}${c.object.length > 100 ? "…" : ""}</div>
          <div style="font-size:12px; color:#64748b; margin-bottom:2px;">📋 Entidade: ${c.entity}</div>
          <div style="font-size:12px; color:#64748b; margin-bottom:6px;">🏆 Vencedor: ${c.winner}</div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <div style="width:120px; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
              <div style="width:${Math.min(progressPct, 100)}%; height:100%; background:${barColor}; border-radius:4px;"></div>
            </div>
            <span style="font-size:13px; font-weight:700; color:${barColor};">${progressPct}%</span>
          </div>
          <div style="font-size:11px; color:#94a3b8;">
            Celebração: ${c.signingDate} · Prazo: ${c.deadlineDays} dias · Término estimado: ${c.estimatedEndDate} · Valor: ${priceStr}
          </div>
        </td>
      </tr>`;
    })
    .join("");

  const html = `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 680px; margin: 0 auto; background: #f1f5f9; }
  .container { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
  .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 28px 24px; }
  .header h2 { margin: 0; font-size: 22px; }
  .header p { margin: 6px 0 0; opacity: 0.85; font-size: 14px; }
  .body { padding: 24px; }
  .stats { display: flex; gap: 12px; margin-bottom: 20px; }
  .stat { flex: 1; background: #f8fafc; padding: 12px; border-radius: 8px; text-align: center; }
  .stat .number { font-size: 28px; font-weight: 700; color: #059669; }
  .stat .label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; }
  .btn { display: inline-block; background: #059669; color: white; padding: 12px 28px;
         border-radius: 8px; text-decoration: none; margin-top: 16px; font-weight: 600; }
  .footer { font-size: 11px; color: #94a3b8; padding: 16px 24px; text-align: center; }
</style></head>
<body>
  <div class="container">
    <div class="header">
      <h2>⚠️ Alerta Market Intelligence</h2>
      <p>Contratos prestes a terminar o prazo de execução</p>
    </div>
    <div class="body">
      <p>Olá <strong>${subscriberName}</strong>,</p>
      <p>Foram detetados <strong>${contracts.length} contrato(s)</strong> que atingiram ≥75% do prazo de execução:</p>

      <table>${contractRows}</table>

      <div style="text-align:center; margin-top:24px;">
        <a href="${appBaseUrl}/outros" class="btn">Ver todos no Market Intelligence</a>
      </div>
    </div>
    <div class="footer">
      Recebe este email porque está subscrito aos alertas Market Intelligence do Helpdesk Público.<br/>
      Para deixar de receber, contacte-nos em <a href="${appBaseUrl}">${appBaseUrl}</a>.
    </div>
  </div>
</body>
</html>`;

  const contractTexts = contracts
    .map((c) => {
      const progressPct = Math.round(c.progress * 100);
      const priceStr = c.contractPrice
        ? new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(c.contractPrice)
        : "N/A";
      return `• ${c.object.slice(0, 80)} (${progressPct}%) — Valor: ${priceStr} — Término: ${c.estimatedEndDate}`;
    })
    .join("\n");

  const text = `Alerta Market Intelligence
============================
Olá ${subscriberName},

${contracts.length} contrato(s) prestes a terminar:

${contractTexts}

Ver em: ${appBaseUrl}/outros`;

  return { subject, html, text };
}
