import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const maxDuration = 900;

type FunctionResult = {
  ok: boolean;
  status: number;
  data: unknown;
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

function numericField(data: unknown, field: string): number {
  if (!data || typeof data !== "object") return 0;
  const value = (data as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (appUserError) {
    return { ok: false as const, response: NextResponse.json({ error: appUserError.message }, { status: 500 }) };
  }

  if (!appUser || appUser.role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Acesso negado: apenas admin." }, { status: 403 }) };
  }

  return { ok: true as const };
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

async function callInternalDr(origin: string, body: Record<string, unknown>): Promise<FunctionResult> {
  const { serviceRoleKey } = getSupabaseAdminEnv("Run ingest pipeline");
  const res = await fetch(new URL("/api/admin/ingest-dr", origin), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  return { ok: res.ok, status: res.status, data };
}

async function runPipeline(origin: string, fromDate: string, toDate: string, dryRun: boolean) {
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

  const fetched = baseRes.ok ? numericField(baseRes.data, "fetched") : 0;
  const shouldRunDr = fetched > 0 || fromDate === todayIso() || toDate === todayIso() || !!baseError;
  const drRes = shouldRunDr
    ? await callInternalDr(origin, rangeBody)
    : {
        ok: true,
        status: 200,
        data: { skipped: true, reason: "no_new_base_announcements" },
      };

  const mqRes = await callFunction("match-and-queue", rangeBody);
  const ok = drRes.ok && mqRes.ok;

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
      const origin = req.nextUrl.origin;
      void runPipeline(origin, fromDate, toDate, false).catch((error) => {
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

    const result = await runPipeline(req.nextUrl.origin, fromDate, toDate, dryRun);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Falha a executar pipeline de anuncios: ${message}` }, { status: 500 });
  }
}
