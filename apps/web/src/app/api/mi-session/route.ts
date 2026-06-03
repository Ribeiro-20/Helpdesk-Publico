import { NextResponse } from "next/server";

const MI_SESSION_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export async function POST() {
  const expiresAt = Date.now() + MI_SESSION_DURATION_MS;

  const response = NextResponse.json({ ok: true, expiresAt });

  // Set a cookie with the session expiry timestamp
  // httpOnly: false so the client-side timer can read the expiry
  response.cookies.set("mi_session", String(expiresAt), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    // Cookie expires in 10 minutes
    maxAge: 10 * 60,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });

  // Clear the MI session cookie
  response.cookies.set("mi_session", "", {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 0,
  });

  return response;
}
