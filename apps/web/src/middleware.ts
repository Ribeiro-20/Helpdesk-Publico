import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

const PUBLIC_PATHS = [
  "/",
  "/mercado-publico",
  "/estatisticas-publico",
  "/estatisticas-privado",
  "/oportunidades",
  "/outros",
  "/api/contracts",
  "/api/cpv-search",
];

// Also allow any sub-paths of the above

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function isPrefetchRequest(request: NextRequest): boolean {
  return (
    request.headers.get("next-router-prefetch") !== null ||
    request.headers.get("purpose") === "prefetch"
  );
}

function createMiddlewareSupabaseClient(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, anonKey } = getSupabasePublicEnv("Supabase middleware");

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: object) {
          request.cookies.set(name, value);
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set(
            name,
            value,
            options as Parameters<typeof supabaseResponse.cookies.set>[2],
          );
        },
        remove(name: string, options: object) {
          request.cookies.set(name, "");
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set(
            name,
            "",
            options as Parameters<typeof supabaseResponse.cookies.set>[2],
          );
        },
      },
    },
  );

  return {
    supabase,
    getResponse: () => supabaseResponse,
  };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  // Skip auth check entirely for public pages — no Supabase call needed
  if (isPublic) {
    return NextResponse.next({ request });
  }

  const isLoginPage = pathname.startsWith("/login");
  const isAuthCallback = pathname.startsWith("/auth");

  const { supabase, getResponse } = createMiddlewareSupabaseClient(request);

  // Always require credentials in "Area de utilizador".
  // Opening /login invalidates any existing session and shows login form again.
  if (isLoginPage && request.method === "GET" && !isPrefetchRequest(request)) {
    await supabase.auth.signOut();
    return getResponse();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isLoginPage && !isAuthCallback) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return getResponse();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
