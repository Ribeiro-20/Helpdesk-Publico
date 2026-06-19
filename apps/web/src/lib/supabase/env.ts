export type SupabasePublicEnv = {
  url: string;
  anonKey: string;
};

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

export function getSupabasePublicEnv(scope = "Supabase"): SupabasePublicEnv {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (missing.length > 0) {
    throw new Error(
      `${scope}: missing environment variables ${missing.join(", ")}. Set them in apps/web/.env.local and restart npm run dev --prefix apps/web.`,
    );
  }

  return { url, anonKey };
}

export type SupabaseAdminEnv = {
  url: string;
  serviceRoleKey: string;
};

export function getSupabaseAdminEnv(scope = "Supabase Admin"): SupabaseAdminEnv {
  // Prefer internal SUPABASE_URL for server-side calls (bypasses reverse proxy).
  // Falls back to NEXT_PUBLIC_SUPABASE_URL if SUPABASE_URL is not set.
  const url = clean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    throw new Error(
      `${scope}: missing environment variables ${missing.join(", ")}.`,
    );
  }

  return { url, serviceRoleKey };
}
