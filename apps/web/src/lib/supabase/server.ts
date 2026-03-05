import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
