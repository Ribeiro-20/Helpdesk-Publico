import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

async function requireUserAndTenant(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return { status: 401, body: { error: "Não autenticado." } };

  const { data: appUser, error: appUserErr } = await supabase
    .from("app_users")
    .select("tenant_id, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (appUserErr) return { status: 500, body: { error: appUserErr.message } };
  if (!appUser) return { status: 403, body: { error: "Acesso negado." } };

  return { status: 200, user: userData.user, appUser };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const check = await requireUserAndTenant(supabase);
    if (check.status !== 200) return NextResponse.json(check.body, { status: check.status });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tenant_id = (check as any).appUser.tenant_id as string;

    const insertPayload: Record<string, unknown> = {
      tenant_id,
      name: String(body.name ?? "").trim(),
      company_name: body.company_name ?? null,
      cpv_s_alerta_concursos_publicos: body.cpv_s_alerta_concursos_publicos ?? null,
      notification_regions: body.notification_regions ?? ["Todos"],
      entity_nipc: body.entity_nipc ?? null,
      distrito: body.distrito ?? null,
      pais: body.pais ?? null,
      position_title: body.position_title ?? null,
      department: body.department ?? null,
      classification: body.classification ?? null,
      subscription_type: body.subscription_type ?? null,
      contact_name: body.contact_name ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      notify_mode: body.notify_mode ?? "instant",
      max_emails_per_day: body.max_emails_per_day ?? 20,
    };

    const { data, error } = await supabase.from("clients").insert(insertPayload).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const check = await requireUserAndTenant(supabase);
    if (check.status !== 200) return NextResponse.json(check.body, { status: check.status });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing client id" }, { status: 400 });

    const updatePayload: Record<string, unknown> = {};
    const allowed = [
      "name",
      "company_name",
      "cpv_s_alerta_concursos_publicos",
      "entity_nipc",
      "distrito",
      "pais",
      "position_title",
      "department",
      "classification",
      "subscription_type",
      "contact_name",
      "phone",
      "email",
      "notify_mode",
      "max_emails_per_day",
    ];

    for (const k of allowed) {
      if (k in body) updatePayload[k] = (body as any)[k];
    }

    const { error } = await supabase.from("clients").update(updatePayload).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const check = await requireUserAndTenant(supabase);
    if (check.status !== 200) return NextResponse.json(check.body, { status: check.status });

    const { data, error } = await supabase
      .from("clients")
      .select(
        "id, name, company_name, entity_nipc, distrito, pais, position_title, department, classification, subscription_type, cpv_s_alerta_concursos_publicos, notification_regions, contact_name, phone, email, is_active, notify_mode, max_emails_per_day, created_at, client_cpv_rules (id, pattern, match_type, is_exclusion)",
      )
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
