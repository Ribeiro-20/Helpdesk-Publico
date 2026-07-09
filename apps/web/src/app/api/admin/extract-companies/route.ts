import { createClient, createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { data: appUser } = await supabase.from("app_users").select("role, tenant_id").eq("id", user.id).maybeSingle();
    if (!appUser || appUser.role !== "admin") return NextResponse.json({ error: "Acesso negado: apenas admin." }, { status: 403 });

    // Ignorar req para evitar erros de parsing
    await req.json().catch(() => ({}));

    const admin = await createAdminClient();
    const { data, error } = await admin.rpc("refresh_companies_from_contracts", {
      p_tenant_id: appUser.tenant_id as string,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
