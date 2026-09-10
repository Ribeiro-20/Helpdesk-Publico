import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminEnv } from "@/lib/supabase/env";
import { validateDrIngestDateRange } from "@/lib/dr-ingest-validation";
import { runDrIngest } from "@/lib/server/ingest-dr";

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function defaultDateRange(): { fromDate: string; toDate: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 2);
  const toIso = (date: Date) => date.toISOString().slice(0, 10);
  return { fromDate: toIso(from), toDate: toIso(today) };
}

export async function POST(req: NextRequest) {
  try {
    const internalAuth = req.headers.get("authorization") ?? "";
    const { serviceRoleKey } = getSupabaseAdminEnv("Ingest DR route");
    const isInternalRequest = internalAuth === `Bearer ${serviceRoleKey}`;

    if (!isInternalRequest) {
      const supabase = await createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
      }

      const { data: appUser, error: appUserError } = await supabase
        .from("app_users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (appUserError) {
        return NextResponse.json({ error: appUserError.message }, { status: 500 });
      }
      if (!appUser || appUser.role !== "admin") {
        return NextResponse.json({ error: "Acesso negado: apenas admin." }, { status: 403 });
      }
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const defaults = defaultDateRange();
    const fromDate = isIsoDate(body.from_date) ? body.from_date : defaults.fromDate;
    const toDate = isIsoDate(body.to_date) ? body.to_date : defaults.toDate;
    let days: number;
    try {
      days = validateDrIngestDateRange(fromDate, toDate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const waitMs = parsePositiveInt(body.wait_ms, 12000);
    const maxResults = parsePositiveInt(body.max_results, Math.min(Math.max(days * 250, 300), 5000));
    const result = await runDrIngest({ fromDate, toDate, waitMs, maxResults });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Falha a executar ingestão DR: ${message}` }, { status: 500 });
  }
}
