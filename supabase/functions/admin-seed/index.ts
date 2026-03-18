/**
 * Edge Function: admin-seed
 *
 * Creates the first tenant ("Default") and registers the authenticated user
 * as admin in app_users.
 *
 * Security:
 *  - If the tenants table is empty → anyone authenticated can seed (first-run).
 *  - If tenants exist and app_users is empty → bootstrap recovery allowed.
 *  - If tenants and app_users already exist → requires x-admin-seed-secret == ADMIN_SEED_SECRET.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-seed-secret",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Resolve authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: CORS,
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );

    const {
      data: { user },
      error: authErr,
    } = await supabaseUser.auth.getUser();
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "Not authenticated", detail: authErr?.message }),
        { status: 401, headers: CORS },
      );
    }

    // Return early if this user is already initialised.
    const { data: existingUser } = await supabaseAdmin
      .from("app_users")
      .select("tenant_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (existingUser) {
      return new Response(
        JSON.stringify({
          message: "User already initialised",
          tenant_id: existingUser.tenant_id,
          role: existingUser.role,
        }),
        { status: 200, headers: CORS },
      );
    }

    // Check bootstrap state.
    const { count: tenantCount } = await supabaseAdmin
      .from("tenants")
      .select("*", { count: "exact", head: true });

    // Fresh install: no tenant yet -> create one and map current user as admin.
    if ((tenantCount ?? 0) === 0) {
      const { data: tenant, error: tenantErr } = await supabaseAdmin
        .from("tenants")
        .insert({ name: "Default" })
        .select()
        .single();

      if (tenantErr) throw tenantErr;

      const { error: userErr } = await supabaseAdmin.from("app_users").insert({
        id: user.id,
        tenant_id: tenant.id,
        role: "admin",
      });

      if (userErr) {
        // Rollback tenant (best-effort)
        await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
        throw userErr;
      }

      return new Response(
        JSON.stringify({
          success: true,
          tenant_id: tenant.id,
          user_id: user.id,
          role: "admin",
          message: "System initialised successfully",
        }),
        { status: 200, headers: CORS },
      );
    }

    // Existing tenant(s): allow without secret only if no app_users yet
    // (bootstrap recovery when tenant was created manually).
    const { count: appUsersCount } = await supabaseAdmin
      .from("app_users")
      .select("*", { count: "exact", head: true });

    const secret = Deno.env.get("ADMIN_SEED_SECRET");
    const provided = req.headers.get("x-admin-seed-secret");
    const isBootstrapRecovery = (appUsersCount ?? 0) === 0;
    const hasValidSecret = !!secret && provided === secret;

    if (!isBootstrapRecovery && !hasValidSecret) {
      return new Response(
        JSON.stringify({
          error:
            "System already initialised. Supply the correct x-admin-seed-secret header.",
        }),
        { status: 403, headers: CORS },
      );
    }

    // Attach current user as admin to the oldest tenant.
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (tenantErr || !tenant) {
      throw tenantErr ?? new Error("No tenant found");
    }

    const { error: userErr } = await supabaseAdmin.from("app_users").insert({
      id: user.id,
      tenant_id: tenant.id,
      role: "admin",
    });

    if (userErr) throw userErr;

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenant.id,
        user_id: user.id,
        role: "admin",
        bootstrap_recovery: isBootstrapRecovery,
        message: "User linked to existing tenant",
      }),
      { status: 200, headers: CORS },
    );
  } catch (err) {
    console.error("[admin-seed] error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
