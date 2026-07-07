import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

// Same HMAC secret used in mi-login
function getHmacSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "mi-login-fallback-secret";
}

function verifyToken(token: string, submittedCode: string): { valid: boolean; error?: string } {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf-8"));
    const { email, expiresAt, hmac } = decoded;

    if (!email || !expiresAt || !hmac) {
      return { valid: false, error: "Token inválido." };
    }

    // Check expiry
    if (Date.now() > expiresAt) {
      return { valid: false, error: "Código expirado. Solicite um novo." };
    }

    // Recompute HMAC with the submitted code
    const payload = `${email}:${submittedCode}:${expiresAt}`;
    const expectedHmac = crypto.createHmac("sha256", getHmacSecret()).update(payload).digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expectedHmac, "hex"))) {
      return { valid: false, error: "Código incorreto." };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Token inválido ou corrompido." };
  }
}

export async function POST(request: Request) {
  try {
    const { email, code, token } = await request.json();

    if (!email || !code || !token) {
      return NextResponse.json({ error: "Email, código e token são obrigatórios." }, { status: 400 });
    }

    // Verify the HMAC token (stateless — no DB lookup)
    const result = verifyToken(token, code);

    if (!result.valid) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Success! Set MI session cookie (10 minutes)
    const response = NextResponse.json({ success: true });
    const cookieStore = await cookies();

    cookieStore.set("mi-session", "active", {
      path: "/",
      maxAge: 60 * 10, // 10 minutes
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return response;
  } catch (err) {
    console.error("[MI-VERIFY] Error:", err);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
