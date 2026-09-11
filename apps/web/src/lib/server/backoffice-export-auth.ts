import { createClient } from "@/lib/supabase/server";

export type BackofficeUser = {
  userId: string;
  tenantId: string;
  role: "admin" | "operator" | "viewer";
};

export type BackofficeAuthResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; user: BackofficeUser }
  | { ok: false; status: 401 | 403 | 500; error: string };

export async function requireBackofficeUser(): Promise<BackofficeAuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, status: 401, error: "Não autenticado." };
  }

  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (appUserError) {
    console.error("[backoffice-export] app user lookup failed", appUserError);
    return {
      ok: false,
      status: 500,
      error: "Não foi possível validar o acesso ao backoffice neste momento.",
    };
  }
  if (!appUser?.tenant_id) {
    return { ok: false, status: 403, error: "Acesso ao backoffice negado." };
  }

  return {
    ok: true,
    supabase,
    user: {
      userId: user.id,
      tenantId: String(appUser.tenant_id),
      role: appUser.role as BackofficeUser["role"],
    },
  };
}
