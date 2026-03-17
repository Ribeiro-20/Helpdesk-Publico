import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv, getSupabaseAdminEnv } from "@/lib/supabase/env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv("Supabase server client");

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: object) {
          try {
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
          } catch {
            // Server component – cookies can't be set here, middleware handles it
          }
        },
        remove(name: string, options: object) {
          try {
            cookieStore.set(name, "", options as Parameters<typeof cookieStore.set>[2]);
          } catch {
            // Server component – cookies can't be set here, middleware handles it
          }
        },
      },
    },
  );
}

export async function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseAdminEnv("Supabase admin client");

  return createServerClient(
    url,
    serviceRoleKey,
    {
      cookies: {
        get(name: string) {
          return undefined; // Admin client doesn't need cookies
        },
        set(name: string, value: string, options: object) {},
        remove(name: string, options: object) {},
      },
    },
  );
}
