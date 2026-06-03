import { createAdminClient, createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
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
      .select("role, tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (appUserError) {
      return NextResponse.json({ error: appUserError.message }, { status: 500 });
    }

    if (!appUser || appUser.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado: apenas admin." }, { status: 403 });
    }

    const tenantId = appUser.tenant_id;
    const limitValue = req.nextUrl.searchParams.get("limit");
    const limit = Number.isFinite(Number(limitValue)) && Number(limitValue) > 0 ? Math.min(Number(limitValue), 200) : 60;

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("ingestion_history")
      .select("id, tenant_id, user_id, title, status, category, range, steps, note, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
