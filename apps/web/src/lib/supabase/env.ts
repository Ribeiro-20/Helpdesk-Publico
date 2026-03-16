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
