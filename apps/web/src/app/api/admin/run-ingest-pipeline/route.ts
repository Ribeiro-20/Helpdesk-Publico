import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getSupabaseAdminEnv } from "@/lib/supabase/env";
import { hasAnnouncementChanges } from "@/lib/admin-announcement-pipeline";
import { runDrIngest } from "@/lib/server/ingest-dr";

export const runtime = "nodejs";
export const maxDuration = 900;

type FunctionResult = {
  ok: boolean;
  status: number;
  data: unknown;
};

type AdminContext = {
  userId: string;
  tenantId: string | null;
  systemAlertEmail: string | null;
  tenantName: string | null;
};

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultDateRange(): { fromDate: string; toDate: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 2);

  return { fromDate: from.toISOString().slice(0, 10), toDate: todayIso() };
}

function daysInclusive(fromDate: string, toDate: string): number {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function formatError(result: FunctionResult): string | null {
  if (result.ok) return null;
  const data = result.data;
  if (data && typeof data === "object") {
    const error = (data as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim()) return error.trim();
  }
  if (typeof data === "string" && data.trim()) return data.trim().slice(0, 500);
  return `HTTP ${result.status}`;
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, response: NextResponse.json({ error: "Nao autenticado." }, { status: 401 }) };
  }

  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (appUserError) {
    return { ok: false as const, response: NextResponse.json({ error: appUserError.message }, { status: 500 }) };
  }

  if (!appUser || appUser.role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Acesso negado: apenas admin." }, { status: 403 }) };
  }

  const tenantId = appUser.tenant_id ?? null;
  let systemAlertEmail: string | null = null;
  let tenantName: string | null = null;

  if (tenantId) {
    const admin = await createAdminClient();
    const { data: tenant } = await admin
      .from("tenants")
      .select("name, system_alert_email")
      .eq("id", tenantId)
      .maybeSingle();

    systemAlertEmail = tenant?.system_alert_email ?? null;
    tenantName = tenant?.name ?? null;
  }

  return {
    ok: true as const,
    context: {
      userId: user.id,
      tenantId,
      systemAlertEmail,
      tenantName,
    } as AdminContext,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendSystemEmail(to: string, subject: string, text: string) {
  const provider = (process.env.EMAIL_PROVIDER ?? (process.env.BREVO_API_KEY ? "brevo" : "dev")).trim().toLowerCase();
  const fromEmail = process.env.EMAIL_FROM ?? process.env.MAIL_FROM ?? "noreply@example.com";
  const fromName = process.env.EMAIL_FROM_NAME ?? "BASE Monitor";
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;"><div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;"><h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(subject)}</h1><pre style="white-space:pre-wrap;word-break:break-word;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;font-size:13px;line-height:1.55;">${escapeHtml(text)}</pre></div></body></html>`;

  // ----- BREVO PROVIDER -----
  if (provider === "brevo") {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error("EMAIL_PROVIDER=brevo but BREVO_API_KEY is not set");

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Brevo ${response.status}: ${await response.text()}`);
    }
    return;
  }

  if (provider === "mailpit") {
    const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";
    const response = await fetch(`${mailpitUrl}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: fromEmail, Name: fromName },
        To: [{ Email: to }],
        Subject: subject,
        HTML: html,
        Text: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Mailpit ${response.status}: ${await response.text()}`);
    }
    return;
  }

  if (provider === "sendgrid") {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) throw new Error("EMAIL_PROVIDER=sendgrid but SENDGRID_API_KEY is not set");

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [
          { type: "text/html", value: html },
          { type: "text/plain", value: text },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`SendGrid ${response.status}: ${await response.text()}`);
    }
    return;
  }

  console.log("─────────────────────────────────────────");
  console.log(`[SYSTEM ALERT] To      : ${to}`);
  console.log(`[SYSTEM ALERT] Subject : ${subject}`);
  console.log(`[SYSTEM ALERT] Body    :\n${text}`);
  console.log("─────────────────────────────────────────");
}

async function notifySystemAlert(context: AdminContext, subject: string, payload: Record<string, unknown>) {
  if (!context.systemAlertEmail) return;

  const text = [
    `Tenant: ${context.tenantName ?? context.tenantId ?? "—"}`,
    `Utilizador admin: ${context.userId}`,
    `Assunto: ${subject}`,
    "",
    "Detalhe técnico (JSON):",
    JSON.stringify(payload, null, 2),
  ].join("\n");

  try {
    await sendSystemEmail(context.systemAlertEmail, subject, text);
  } catch (error) {
    console.error("[run-ingest-pipeline] failed to send system alert:", error);
  }
}

async function callFunction(name: string, body: Record<string, unknown>): Promise<FunctionResult> {
  const { url, serviceRoleKey } = getSupabaseAdminEnv("Run ingest pipeline");
  const functionsBaseUrl = (process.env.SUPABASE_INTERNAL_URL?.trim() || url).replace(/\/$/, "");
  const res = await fetch(`${functionsBaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 1000) };
  }

  return { ok: res.ok, status: res.status, data };
}

async function runPipeline(fromDate: string, toDate: string, dryRun: boolean) {
  const rangeBody = { from_date: fromDate, to_date: toDate };
  const baseBody = dryRun ? { ...rangeBody, dry_run: true } : rangeBody;
  const baseRes = await callFunction("ingest-base", baseBody);
  const baseError = formatError(baseRes);

  if (dryRun) {
    return {
      ok: baseRes.ok,
      dry_run: true,
      from_date: fromDate,
      to_date: toDate,
      ingest_base: baseRes.data,
      ingest_base_error: baseError,
    };
  }

  if (baseRes.ok && !hasAnnouncementChanges((baseRes.data ?? {}) as Record<string, unknown>)) {
    return {
      ok: true,
      no_new_announcements: true,
      message: "Não foram encontrados anúncios novos.",
      from_date: fromDate,
      to_date: toDate,
      ingest_base: baseRes.data,
      ingest_base_error: null,
      ingest_dr: { skipped: true, reason: "no_new_announcements" },
      match_and_queue: { skipped: true, reason: "no_new_announcements" },
    };
  }

  let drRes: FunctionResult;
  try {
    const data = await runDrIngest({
      fromDate,
      toDate,
      waitMs: 12000,
      maxResults: Math.min(Math.max(daysInclusive(fromDate, toDate) * 250, 300), 5000),
    });
    drRes = { ok: true, status: 200, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    drRes = { ok: false, status: 500, data: { error: `Falha a executar ingestão DR: ${message}` } };
  }

  const mqRes = await callFunction("match-and-queue", rangeBody);
  const ok = baseRes.ok && drRes.ok && mqRes.ok;

  return {
    ok,
    from_date: fromDate,
    to_date: toDate,
    ingest_base: baseRes.data,
    ingest_base_error: baseError,
    ingest_dr: drRes.data,
    match_and_queue: mqRes.data,
  };
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const parsedBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const defaults = defaultDateRange();
    const fromDate = isIsoDate(parsedBody.from_date) ? parsedBody.from_date : defaults.fromDate;
    const toDate = isIsoDate(parsedBody.to_date) ? parsedBody.to_date : defaults.toDate;
    const dryRun = parsedBody.dry_run === true;
    const asyncMode = parsedBody.async === true && !dryRun;
    const days = daysInclusive(fromDate, toDate);

    if (days <= 0) {
      return NextResponse.json({ error: "A data final tem de ser igual ou posterior a data inicial." }, { status: 400 });
    }

    if (days > 31) {
      return NextResponse.json({ error: "So e possivel ingerir anuncios ate 31 dias por pedido." }, { status: 400 });
    }

    if (asyncMode) {
      void runPipeline(fromDate, toDate, false).catch((error) => {
        console.error("[run-ingest-pipeline] background pipeline failed:", error);
      });

      return NextResponse.json(
        {
          ok: true,
          queued: true,
          from_date: fromDate,
          to_date: toDate,
          message: "Pipeline de anuncios iniciado no servidor.",
        },
        { status: 202 },
      );
    }

    const result = await runPipeline(fromDate, toDate, dryRun);

    if (!dryRun && !result.ok && admin.context) {
      await notifySystemAlert(
        admin.context,
        "Alerta do sistema: falha na ingestão manual de anúncios",
        {
          source: "backoffice_ingest_button",
          from_date: fromDate,
          to_date: toDate,
          ingest_base: result.ingest_base,
          ingest_base_error: result.ingest_base_error,
          ingest_dr: result.ingest_dr,
          match_and_queue: result.match_and_queue,
        },
      );
    }

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Falha a executar pipeline de anuncios: ${message}` }, { status: 500 });
  }
}
