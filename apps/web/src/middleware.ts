import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdminEnv, getSupabasePublicEnv } from "@/lib/supabase/env";

const PUBLIC_PATHS = [
  "/",
  "/mp/contratos-publicos",
  "/mp/entidades-adjudicantes",
  "/mp/empresas-adjudicatarios",
  "/mp/oportunidades-mercado",
  "/mp/login-mi",
  "/mp/login",
  "/outros",
  "/api/contracts",
  "/api/mi-login",
  "/api/mi-verify",
  "/api/announcements",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPrefetchRequest(request: NextRequest): boolean {
  return (
    request.headers.get("next-router-prefetch") !== null ||
    request.headers.get("purpose") === "prefetch"
  );
}

function isInternalAdminRequest(request: NextRequest): boolean {
  if (!request.nextUrl.pathname.startsWith("/api/admin/")) {
    return false;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return false;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return false;
  }

  try {
    const { serviceRoleKey } = getSupabaseAdminEnv("Supabase middleware");
    return token === serviceRoleKey;
  } catch {
    return false;
  }
}

function createMiddlewareSupabaseClient(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, anonKey } = getSupabasePublicEnv("Supabase middleware");

  const supabase = createServerClient(url, anonKey, {
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
  });

  return {
    supabase,
    getResponse: () => supabaseResponse,
  };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isInternalAdminRequest(request)) {
    return NextResponse.next({ request });
  }

  // Skip auth check entirely for public pages — no Supabase call needed
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request });
  }

  // Market Intelligence Protection (mi session cookie)
  if (pathname.startsWith("/outros")) {
    const miSession = request.cookies.get("mi-session")?.value;
    if (!miSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/mp/login-mi";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  const isLoginPage = pathname.startsWith("/mp/login");
  const isAuthCallback = pathname.startsWith("/auth");

  const { supabase, getResponse } = createMiddlewareSupabaseClient(request);

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
    url.pathname = "/mp/login";
    return NextResponse.redirect(url);
  }

  return getResponse();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
