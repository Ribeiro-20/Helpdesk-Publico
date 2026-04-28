import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

const PUBLIC_PATHS = [
  "/",
  "/mercado-publico",
  "/estatisticas-publico",
  "/estatisticas-privado",
  "/oportunidades",
  "/api/contracts",
  "/login-mi",
  "/api/mi-login",
  "/api/mi-verify",
];

// Also allow any sub-paths of the above

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth check entirely for public pages — no Supabase call needed
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request });
  }

  // Market Intelligence Protection
  if (pathname.startsWith("/outros")) {
    const miSession = request.cookies.get("mi-session")?.value;
    if (!miSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/login-mi";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  const isLoginPage = pathname.startsWith("/login");
  const isAuthCallback = pathname.startsWith("/auth");

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isLoginPage && !isAuthCallback) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
