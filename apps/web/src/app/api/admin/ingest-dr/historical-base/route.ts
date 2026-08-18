import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

type JobKind = "announcements" | "contracts";
const JOB_SELECT = "id, kind, status, from_date, to_date, current_window, total_windows, fetched_count, inserted_count, updated_count, skipped_count, public_error, started_at, finished_at, created_at, updated_at";

function parseKind(value: unknown): JobKind | null {
  return value === "announcements" || value === "contracts" ? value : null;
}

function internalError(scope: string, error: unknown) {
  const correlationId = randomUUID();
  console.error(`[historical-ingestion][${correlationId}] ${scope}`, error);
  return NextResponse.json(
    { ok: false, message: "Não foi possível processar o pedido. Tenta novamente.", correlation_id: correlationId },
    { status: 500 },
  );
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { response: NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 }) };
  const { data: appUser, error: appUserError } = await supabase.from("app_users")
    .select("tenant_id, role").eq("id", authData.user.id).maybeSingle();
  if (appUserError) return { response: internalError("app-user", appUserError) };
  if (!appUser?.tenant_id || appUser.role !== "admin") {
    return { response: NextResponse.json({ ok: false, message: "Acesso negado: apenas admin." }, { status: 403 }) };
  }
  return { supabase: supabase as unknown as SupabaseClient, tenantId: appUser.tenant_id };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const kind = parseKind(req.nextUrl.searchParams.get("kind"));
  if (!kind) return NextResponse.json({ ok: false, message: "Tipo de ingestão inválido." }, { status: 400 });
  const { data: job, error } = await auth.supabase.from("historical_ingestion_jobs")
    .select(JOB_SELECT).eq("tenant_id", auth.tenantId).eq("kind", kind)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return internalError("get-job", error);
  return NextResponse.json({ ok: true, job: job ?? null });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;
    const body = await req.json().catch(() => ({}));
    const kind = parseKind(body.kind);
    if (!kind) return NextResponse.json({ ok: false, message: "Tipo de ingestão inválido." }, { status: 400 });

    const { data: active, error: activeError } = await auth.supabase.from("historical_ingestion_jobs")
      .select(JOB_SELECT).eq("tenant_id", auth.tenantId).eq("kind", kind)
      .in("status", ["queued", "running"]).maybeSingle();
    if (activeError) return internalError("active-job", activeError);
    if (active) return NextResponse.json({ ok: true, message: "A ingestão histórica já está em curso.", job: active }, { status: 202 });

    const { data: failed, error: failedError } = await auth.supabase.from("historical_ingestion_jobs")
      .select("id").eq("tenant_id", auth.tenantId).eq("kind", kind).eq("status", "failed")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (failedError) return internalError("failed-job", failedError);
    if (failed) {
      const { data: resumedData, error: resumeError } = await auth.supabase.rpc("resume_historical_ingestion", { p_job_id: failed.id });
      if (resumeError) return internalError("resume-job", resumeError);
      const resumed = Array.isArray(resumedData) ? resumedData[0] : resumedData;
      return NextResponse.json({ ok: true, message: "Ingestão histórica retomada.", job: resumed }, { status: 202 });
    }

    const { data: queuedData, error: enqueueError } = await auth.supabase.rpc("enqueue_historical_ingestion", {
      p_kind: kind, p_from_date: "2024-01-01", p_to_date: new Date().toISOString().slice(0, 10), p_window_days: 15,
    });
    if (enqueueError) return internalError("enqueue-job", enqueueError);
    const job = Array.isArray(queuedData) ? queuedData[0] : queuedData;
    return NextResponse.json({ ok: true, message: "Ingestão histórica colocada em fila.", job }, { status: 202 });
  } catch (error) {
    return internalError("post-job", error);
  }
}
