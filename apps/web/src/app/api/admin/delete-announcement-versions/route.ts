import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
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

    if (!appUser.tenant_id) {
      return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const dryRun = body.dry_run === true;
    const admin = await createAdminClient();

    const { count, error: countError } = await admin
      .from("announcement_versions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", appUser.tenant_id);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const matchedVersions = count ?? 0;
    const stats = {
      matched_versions: matchedVersions,
      deleted_versions: 0,
      dry_run: dryRun,
    };

    if (!dryRun && matchedVersions > 0) {
      const { error: deleteError } = await admin
        .from("announcement_versions")
        .delete()
        .eq("tenant_id", appUser.tenant_id);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      stats.deleted_versions = matchedVersions;
    }

    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
