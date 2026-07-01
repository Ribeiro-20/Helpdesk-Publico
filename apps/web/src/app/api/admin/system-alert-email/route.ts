import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

function buildRedirect(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/settings/alertas-sistema", req.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.redirect(buildRedirect(req, { error: encodeURIComponent("Não autenticado.") }), 303);
    }

    const { data: appUser, error: appUserError } = await supabase
      .from("app_users")
      .select("role, tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (appUserError) {
      return NextResponse.redirect(buildRedirect(req, { error: encodeURIComponent(appUserError.message) }), 303);
    }

    if (!appUser || appUser.role !== "admin") {
      return NextResponse.redirect(buildRedirect(req, { error: encodeURIComponent("Apenas administradores podem alterar este destino.") }), 303);
    }

    const formData = await req.formData();
    const rawEmail = String(formData.get("system_alert_email") ?? "").trim().toLowerCase();
    const systemAlertEmail = rawEmail || null;

    if (systemAlertEmail && !isValidEmail(systemAlertEmail)) {
      return NextResponse.redirect(buildRedirect(req, { error: encodeURIComponent("O email selecionado não é válido.") }), 303);
    }

    const admin = await createAdminClient();
    const { error } = await admin
      .from("tenants")
      .update({ system_alert_email: systemAlertEmail })
      .eq("id", appUser.tenant_id);

    if (error) {
      return NextResponse.redirect(buildRedirect(req, { error: encodeURIComponent(error.message) }), 303);
    }

    return NextResponse.redirect(buildRedirect(req, { saved: "1" }), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(buildRedirect(req, { error: encodeURIComponent(message) }), 303);
  }
}